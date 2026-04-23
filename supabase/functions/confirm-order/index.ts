// Supabase Edge Function: 決済成功後の注文レコード作成 + メール送信
// POST /functions/v1/confirm-order
//
// PaymentIntent が succeeded であることを Stripe API で検証した上で、
// orders + order_items テーブルにINSERTし、Thanksメールを送信する。
//
// ※ 旧フローでは create-payment-intent 時に pending で INSERT していたが、
//   新フローでは決済完了後にここで初めて INSERT する。

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, corsPreflightResponse } from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// 同一カード注文頻度制限
const CARD_RATE_LIMIT_WINDOW_HOURS = 1
const CARD_RATE_LIMIT_MAX_ORDERS = 5

// 1日あたりのカード決済上限（円）
const MAX_DAILY_PAYMENT_AMOUNT = parseInt(Deno.env.get('MAX_DAILY_PAYMENT_AMOUNT') || '50000', 10)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証スキップ: Stripe PaymentIntent検証が認証の代わり

  try {
    const { payment_intent_id } = await req.json()

    if (!payment_intent_id) {
      return new Response(
        JSON.stringify({ error: 'payment_intent_id が必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Stripe API で PaymentIntent のステータスを検証（フロントエンドを信用しない）
    const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      },
    })

    if (!stripeRes.ok) {
      return new Response(
        JSON.stringify({ error: 'PaymentIntent の取得に失敗しました' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const pi = await stripeRes.json()

    if (pi.status !== 'succeeded' && pi.status !== 'requires_capture') {
      return new Response(
        JSON.stringify({ error: '決済が完了していません（status: ' + pi.status + '）' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ¥50,000 注文上限チェック（チャージバック対策）
    const MAX_ORDER_AMOUNT = parseInt(Deno.env.get('MAX_ORDER_AMOUNT') || '50000', 10)
    // JPY は zero-decimal currency: pi.amount は既に円単位
    const amountInYen = pi.amount
    if (amountInYen > MAX_ORDER_AMOUNT) {
      return new Response(
        JSON.stringify({ error: `1回のご注文は${MAX_ORDER_AMOUNT.toLocaleString()}円までとなります` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. カードfingerprint取得 + 頻度制限チェック
    let cardFingerprint: string | null = null
    if (pi.payment_method) {
      try {
        const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pi.payment_method}`, {
          headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
        })
        if (pmRes.ok) {
          const pm = await pmRes.json()
          cardFingerprint = pm.card?.fingerprint || null
        }
      } catch (e) {
        console.warn('Failed to fetch payment method:', e)
      }
    }

    if (cardFingerprint) {
      const windowStart = new Date(Date.now() - CARD_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('card_fingerprint', cardFingerprint)
        .gte('created_at', windowStart)
        .not('payment_status', 'eq', 'failed')

      if (count !== null && count >= CARD_RATE_LIMIT_MAX_ORDERS) {
        return new Response(
          JSON.stringify({ error: '短時間に多数のご注文がありました。しばらくしてから再度お試しください' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 1日あたりのカード決済上限チェック
      const dailyWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: dailyOrders } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('card_fingerprint', cardFingerprint)
        .gte('created_at', dailyWindowStart)
        .not('payment_status', 'eq', 'failed')

      const dailyTotal = (dailyOrders || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0)
      // total_amount は円単位（JPYはStripeでもzero-decimal currency）
      const currentAmount = pi.amount

      if (dailyTotal + currentAmount > MAX_DAILY_PAYMENT_AMOUNT) {
        return new Response(
          JSON.stringify({
            error: `1日あたりの決済上限（¥${MAX_DAILY_PAYMENT_AMOUNT.toLocaleString()}）に達しました`,
            error_code: 'DAILY_LIMIT_EXCEEDED'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3. 冪等性チェック: 同じ payment_intent_id で既に注文が存在する場合
    // CC-Option-Master-Stage2a Phase 3 (2026-04-23 D-166 修正):
    // stripe-create-payment-intent が常に orders を INSERT してから PI.client_secret を返す設計のため、
    // ここでは existingOrder が必ず見つかる前提。
    // 以前存在した「metadata から cart_items_json を復元して INSERT する fallback」は
    // metadata 不整合の原因となっていたため削除済み（git log 90 日で実行履歴無し確認）。
    // member_id / venue_id / aiden_points_used / normal_points_used は existingOrder に含め、
    // ポイント消費・ランク昇格はこのブランチで実行する。
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, display_id, tracking_token, member_id, venue_id, aiden_points_used, normal_points_used')
      .eq('payment_intent_id', payment_intent_id)
      .maybeSingle()

    if (existingOrder) {
      // 既に作成済み（stripe-create-payment-intent で pending INSERT されたケース）
      // → payment_status を paid に更新 + card_fingerprint を記録
      // CHECK制約の許可値: pending, paid, captured, failed, refunded, partially_refunded, disputed
      const updatePayload: Record<string, any> = {
        payment_status: 'paid',
      }
      if (cardFingerprint) {
        updatePayload.card_fingerprint = cardFingerprint
      }

      const { data: updatedRows, error: updateErr } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', existingOrder.id)
        .eq('payment_status', 'pending') // pending の場合のみ更新（冪等性保証）
        .select('id')

      if (updateErr) {
        console.warn('Order status update error:', updateErr)
      }

      // pending→paid に実際に遷移した場合のみ true
      // (2 回目以降の confirm-order 呼び出しでは既に paid のため updatedRows は空)
      const didTransitionToPaid = Array.isArray(updatedRows) && updatedRows.length > 0

      // venue → brand_id を解決（ポイント / ランク処理で必要）
      let brandId: string | null = null
      let storeRow: { name?: string; brands?: { id?: string; name?: string } } | null = null
      try {
        const { data: venueRow } = await supabase
          .from('venues')
          .select('name, brands(id, name)')
          .eq('id', existingOrder.venue_id ?? pi.metadata?.venue_id ?? pi.metadata?.store_id)
          .single()
        storeRow = venueRow as any
        brandId = (venueRow as any)?.brands?.id ?? null
      } catch (venueErr) {
        console.warn('venue/brand lookup failed (non-fatal):', venueErr)
      }

      // メール送信（pending→paid遷移時のみ / 2 回目以降の呼び出しでは送らない）
      if (didTransitionToPaid) {
       try {
        const { data: orderDetail } = await supabase
          .from('orders')
          .select('customer_email, customer_name, order_type, total_amount, order_items(quantity, unit_price, products(name))')
          .eq('id', existingOrder.id)
          .single()

        if (orderDetail?.customer_email) {
          const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              type: 'confirmation',
              to: orderDetail.customer_email,
              order_id: existingOrder.display_id,
              customer_name: orderDetail.customer_name || '',
              store_name: storeRow?.name || '',
              brand_name: storeRow?.brands?.name || '',
              order_mode: orderDetail.order_type || 'takeout',
              subtotal: orderDetail.total_amount || 0,
              total: orderDetail.total_amount || 0,
              tracking_token: existingOrder.tracking_token || '',
              items: (orderDetail.order_items || []).map((i: any) => ({
                name: i.products?.name || '商品',
                qty: i.quantity || 1,
                price: i.unit_price || 0,
              })),
            }),
          })
          if (!emailRes.ok) {
            const errBody = await emailRes.text().catch(() => '')
            console.error('send-order-email failed (existing order):', emailRes.status, errBody)
          }
        }
      } catch (emailErr) {
        console.error('Order email error (existing order):', emailErr)
      }
      } // end if (didTransitionToPaid) — メール送信ブロック

      // 以降の処理（push / points / rank）は pending→paid 遷移時のみ実行
      // 冪等性担保: 2 回目以降の confirm-order は既に payment_status='paid' のため updatedRows が空 → didTransitionToPaid=false
      // これにより deduct_points が二重実行されて残高が過剰に減る事故を防ぐ。
      if (didTransitionToPaid) {
        // 4. プッシュ通知送信（非同期、失敗しても注文は有効）
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              order_id: existingOrder.id,
              store_id: existingOrder.venue_id ?? pi.metadata?.venue_id ?? pi.metadata?.store_id,
              display_id: existingOrder.display_id,
              total_amount: pi.amount,
              order_type: pi.metadata?.order_type || 'takeout',
            }),
          })
        } catch (pushErr) {
          console.error('Push notification error:', pushErr)
        }

        // 5. ポイント消費（IR-08: サーバーサイド原子的処理）
        // CC-Option-Master-Stage2a Phase 3: 旧 dead fallback 内で実行されていた処理を本ブランチに移動。
        const aidenPts = parseInt(String(existingOrder.aiden_points_used ?? 0), 10) || 0
        const normalPts = parseInt(String(existingOrder.normal_points_used ?? 0), 10) || 0
        const pointsUsed = aidenPts + normalPts
        if (existingOrder.member_id && pointsUsed > 0) {
          try {
            const { data: ptResult } = await supabase.rpc('deduct_points', {
              p_member_id: existingOrder.member_id,
              p_brand_id: brandId,
              p_amount: pointsUsed,
              p_order_id: existingOrder.id,
            })
            if (ptResult && !ptResult.success && ptResult.error === 'insufficient_balance') {
              console.warn('Point deduction failed: insufficient balance', ptResult)
            }
          } catch (ptErr) {
            console.error('Point deduction error:', ptErr)
          }
        }

        // 6. ランク自動昇格チェック（G-03）
        if (existingOrder.member_id && brandId) {
          try {
            await supabase.rpc('check_and_upgrade_rank', {
              p_member_id: existingOrder.member_id,
              p_brand_id: brandId,
            })
          } catch (rankErr) {
            console.error('Rank check error:', rankErr)
          }
        }
      } // end if (didTransitionToPaid) — push / points / rank

      return new Response(
        JSON.stringify({
          success: true,
          order_id: existingOrder.id,
          display_id: existingOrder.display_id,
          tracking_token: existingOrder.tracking_token,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // existingOrder が見つからない = 到達不能ケース
    // CC-Option-Master-Stage2a Phase 3 (2026-04-23 D-166 修正):
    // stripe-create-payment-intent が常に orders を INSERT する設計のため、
    // existingOrder が null になるケースは到達不能。
    // 旧 fallback (cart_items_json を metadata から復元して INSERT) は
    // metadata 不整合の原因となっていたため削除 (git log 90日確認済み、main branch では
    // この分岐が実行された履歴なし)。
    // もし将来 stripe-create-payment-intent が INSERT 前に PI 作成する設計になったら
    // この fallback を再実装すること。
    console.error('ORDER_NOT_FOUND_AFTER_PAYMENT:', {
      payment_intent_id,
      pi_status: pi.status,
      pi_amount: pi.amount,
    })
    return new Response(
      JSON.stringify({
        error: '注文レコードが見つかりません。決済情報は正常ですが、注文処理に不整合があります。サポートにお問い合わせください。',
        error_code: 'ORDER_NOT_FOUND_AFTER_PAYMENT',
        payment_intent_id: payment_intent_id,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('confirm-order error:', err)
    return new Response(
      JSON.stringify({ error: '注文確認処理でエラーが発生しました' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
