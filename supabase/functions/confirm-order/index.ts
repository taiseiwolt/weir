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

    // 3. 冪等性チェック: 同じ payment_intent_id で既に注文が存在する場合はスキップ
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, display_id, tracking_token')
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

      const { error: updateErr } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', existingOrder.id)
        .eq('payment_status', 'pending') // pending の場合のみ更新（冪等性保証）

      if (updateErr) {
        console.warn('Order status update error:', updateErr)
      }

      // メール送信（既存注文でもpending→paid遷移時は送信）
      try {
        const { data: storeRow } = await supabase
          .from('stores')
          .select('name, brands(name)')
          .eq('id', pi.metadata?.store_id)
          .single()

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
              brand_name: (storeRow as any)?.brands?.name || '',
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

    // 3. metadata からカート情報を復元
    const meta = pi.metadata || {}
    const cartItems = meta.cart_items_json ? JSON.parse(meta.cart_items_json) : []
    const deliveryAddress = meta.delivery_address_json ? JSON.parse(meta.delivery_address_json) : null

    const guestInfo = {
      first_name: meta.guest_first_name || '',
      last_name: meta.guest_last_name || '',
      email: meta.guest_email || '',
      phone: meta.guest_phone || '',
    }

    // 4. orders テーブルに INSERT（ここで初めてDBに注文レコードが作られる）
    const orderPayload = {
      store_id: meta.store_id,
      order_type: meta.order_type || 'takeout',
      tracking_status: 'placed',
      payment_status: 'paid',
      total_amount: pi.amount,
      delivery_fee: parseInt(meta.delivery_fee) || 0,
      service_fee: parseInt(meta.service_fee) || 0,
      surcharge_amount: parseInt(meta.surcharge_amount) || 0,
      payment_intent_id: pi.id,
      customer_name: guestInfo.last_name && guestInfo.first_name
        ? `${guestInfo.last_name} ${guestInfo.first_name}`
        : (guestInfo.last_name || guestInfo.first_name || null),
      customer_email: guestInfo.email || null,
      customer_phone: guestInfo.phone || null,
      estimated_minutes: parseInt(meta.estimated_minutes) || 30,
      delivery_address: deliveryAddress
        ? `${deliveryAddress.prefecture || ''}${deliveryAddress.city || ''}${deliveryAddress.address || ''}${deliveryAddress.building ? ' ' + deliveryAddress.building : ''}`
        : null,
      aiden_points_used: parseInt(meta.aiden_points_used) || 0,
      normal_points_used: parseInt(meta.normal_points_used) || 0,
      member_id: meta.member_id || null,
      channel: 'aiden',
      card_fingerprint: cardFingerprint,
    }

    const { data: orderRow, error: orderErr } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id, display_id, tracking_token')
      .single()

    if (orderErr) {
      console.error('Order insert error:', orderErr)
      return new Response(
        JSON.stringify({ error: '注文の作成に失敗しました: ' + orderErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. order_items テーブルに INSERT
    if (cartItems.length > 0) {
      const orderItems = cartItems.map((item: any) => ({
        order_id: orderRow.id,
        product_id: item.pid || null,
        size_id: item.sid || null,
        quantity: item.q || 1,
        unit_price: item.up || 0,
        subtotal: (item.up || 0) * (item.q || 1),
      }))
      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) {
        console.error('Order items insert error:', itemsErr)
      }
    }

    // 6. Thanksメール送信（非同期、失敗しても注文は有効）
    try {
      // 店舗名 + ブランド名を取得
      const { data: storeRow } = await supabase
        .from('stores')
        .select('name, brands(name)')
        .eq('id', meta.store_id)
        .single()

      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'confirmation',
          to: guestInfo.email,
          order_id: orderRow.display_id,
          customer_name: `${guestInfo.last_name} ${guestInfo.first_name}`.trim(),
          store_name: storeRow?.name || '',
          brand_name: (storeRow as any)?.brands?.name || '',
          order_mode: meta.order_type || 'takeout',
          subtotal: pi.amount,
          total: pi.amount,
          tracking_token: orderRow.tracking_token || '',
          items: cartItems.map((i: any) => ({
            name: i.pn || '商品',
            qty: i.q || 1,
            price: i.up || 0,
          })),
        }),
      })
      if (!emailRes.ok) {
        const errBody = await emailRes.text().catch(() => '')
        console.error('send-order-email failed (new order):', emailRes.status, errBody)
      }
    } catch (emailErr) {
      console.error('Order email error (new order):', emailErr)
    }

    // 7. プッシュ通知送信（非同期、失敗しても注文は有効）
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          order_id: orderRow.id,
          store_id: meta.store_id,
          display_id: orderRow.display_id,
          total_amount: pi.amount,
          order_type: meta.order_type || 'takeout',
        }),
      })
    } catch (pushErr) {
      console.error('Push notification error:', pushErr)
    }

    // 8. ポイント消費（IR-08: サーバーサイド原子的処理）
    const pointsUsed = (parseInt(meta.aiden_points_used) || 0) + (parseInt(meta.normal_points_used) || 0)
    if (meta.member_id && pointsUsed > 0) {
      try {
        const { data: ptResult } = await supabase.rpc('deduct_points', {
          p_member_id: meta.member_id,
          p_brand_id: meta.brand_id || null,
          p_amount: pointsUsed,
          p_order_id: orderRow.id,
        })
        if (ptResult && !ptResult.success && ptResult.error === 'insufficient_balance') {
          console.warn('Point deduction failed: insufficient balance', ptResult)
        }
      } catch (ptErr) {
        console.error('Point deduction error:', ptErr)
      }
    }

    // 9. ランク自動昇格チェック（G-03）
    if (meta.member_id && meta.brand_id) {
      try {
        // total_spend を更新
        await supabase.rpc('check_and_upgrade_rank', {
          p_member_id: meta.member_id,
          p_brand_id: meta.brand_id,
        })
      } catch (rankErr) {
        console.error('Rank check error:', rankErr)
      }
    }

    // 10. レスポンス
    return new Response(
      JSON.stringify({
        success: true,
        order_id: orderRow.id,
        display_id: orderRow.display_id,
        tracking_token: orderRow.tracking_token,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('confirm-order error:', err)
    return new Response(
      JSON.stringify({ error: '注文確認処理でエラーが発生しました' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
