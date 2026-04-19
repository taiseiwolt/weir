// Supabase Edge Function: Stripe PaymentIntent 作成 + 注文レコード作成（Connect 対応）
// POST /functions/v1/stripe-create-payment-intent
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, corsPreflightResponse } from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// 注文金額上限（円）— 環境変数で上書き可能
const MAX_ORDER_AMOUNT = parseInt(Deno.env.get('MAX_ORDER_AMOUNT') || '50000', 10)

// fee_schedules から手数料率を動的取得
async function getFeeRate(
  supabase: any,
  corporationId: string,
  channel: string,
): Promise<number> {
  // channel mapping: 'pickup' in DB is 'takeout' fee_type
  const feeType = channel === 'pickup' ? 'takeout' : channel

  // 1. 期間限定オーバーライドを優先（is_base=false, 有効期間内）
  const now = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const { data: override } = await supabase
    .from('fee_schedules')
    .select('rate')
    .eq('merchant_id', corporationId)
    .eq('fee_type', feeType)
    .eq('is_base', false)
    .lte('effective_from', now)
    .or(`effective_to.is.null,effective_to.gte.${now}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()

  if (override?.rate != null) {
    return parseFloat(override.rate)
  }

  // 2. ベース料率を取得
  const { data: base } = await supabase
    .from('fee_schedules')
    .select('rate')
    .eq('merchant_id', corporationId)
    .eq('fee_type', feeType)
    .eq('is_base', true)
    .single()

  if (base?.rate != null) {
    return parseFloat(base.rate)
  }

  // 3. フォールバック（DB未登録の場合）
  const FALLBACK_RATES: Record<string, number> = {
    dinein: 0.038,
    takeout: 0.040,
    delivery: 0.040,
  }
  return FALLBACK_RATES[feeType] || 0.040
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証スキップ: 公開チェックアウトエンドポイント

  try {
    const {
      store_id,
      cart_items,
      order_type,
      guest_info,
      delivery_address,
      idempotency_key,
      points_used,
      aiden_points_used,
      normal_points_used,
      member_id,
      coupon_discount,
      coupon_id,
      // SEC: レガシーパラメータは無視 (03-P0-1, 03-P0-3)
    } = await req.json()

    // ── 新フロー（cart_items ベース）──
    if (cart_items && store_id) {
      // カート空チェック
      if (!Array.isArray(cart_items) || cart_items.length === 0) {
        return new Response(
          JSON.stringify({ error: 'カートが空です。商品を追加してください。' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // SEC: 数量バリデーション (03-P1-1)
      for (const item of cart_items) {
        const qty = item.quantity || 0
        if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
          return new Response(
            JSON.stringify({ error: '数量は1〜100の整数で指定してください' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

      // 1. 店舗情報取得（Stripe Connect Account ID含む）
      const { data: storeRow, error: storeErr } = await supabase
        .from('venues')
        .select('*, brands(id, name, merchant_id)')
        .eq('id', store_id)
        .single()

      if (storeErr || !storeRow) {
        return new Response(
          JSON.stringify({ error: '店舗情報が見つかりません', error_code: 'VENUE_NOT_FOUND' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 1a. 臨時閉店チェック（V-B G-2）
      if (storeRow.is_paused) {
        return new Response(
          JSON.stringify({
            error: '現在、この店舗からの注文受付を一時停止しています',
            error_code: 'VENUE_PAUSED',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (
        storeRow.spot_closed_until &&
        new Date(storeRow.spot_closed_until).getTime() > Date.now()
      ) {
        const reopenJstDate = new Date(
          new Date(storeRow.spot_closed_until).getTime() + 9 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10)
        return new Response(
          JSON.stringify({
            error: `${reopenJstDate} まで臨時休業中です`,
            error_code: 'VENUE_SPOT_CLOSED',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 1b. 営業時間チェック（サーバーサイド — C-10 / V-B G-1 深夜営業対応）
      {
        const now = new Date()
        // JST = UTC + 9h
        const jstMs = now.getTime() + 9 * 60 * 60 * 1000
        const jst = new Date(jstMs)
        const dayOfWeek = jst.getUTCDay() // 0=日, 1=月 ... 6=土
        const currentMinutes = jst.getUTCHours() * 60 + jst.getUTCMinutes()

        const { data: hoursRows } = await supabase
          .from('venue_hours')
          .select('open_time, close_time, is_closed')
          .eq('venue_id', store_id)
          .eq('day_of_week', dayOfWeek)

        // 今日の営業時間が存在しない or 全て is_closed の場合は拒否
        const isOpen = hoursRows && hoursRows.some((h: any) => {
          if (h.is_closed) return false
          if (!h.open_time || !h.close_time) return false
          const [oh, om] = (h.open_time as string).split(':').map(Number)
          const [ch, cm] = (h.close_time as string).split(':').map(Number)
          const openMin = oh * 60 + om
          const closeMin = ch * 60 + cm
          // 深夜営業（close_time <= open_time、例: 18:00 open / 02:00 close）対応
          if (closeMin <= openMin) {
            return currentMinutes >= openMin || currentMinutes < closeMin
          }
          return currentMinutes >= openMin && currentMinutes < closeMin
        })

        if (!isOpen) {
          return new Response(
            JSON.stringify({
              error: '現在営業時間外です。営業時間内にご注文ください。',
              error_code: 'OPERATION_OUTSIDE_HOURS',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // 2. サーバー側で商品金額を再計算（フロントエンドの金額を信用しない）
      const productIds = cart_items.map((item: any) => item.product_id).filter(Boolean)
      let productMap: Record<string, any> = {}

      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, sale_status')
          .in('id', productIds)

        if (products) {
          for (const p of products) {
            productMap[p.id] = p
          }
        }

        // 品切れチェック（V-B G-3: sold_out / discontinued / sold_out_today 全て拒否）
        const UNAVAILABLE_SALE_STATUSES = ['sold_out', 'discontinued', 'sold_out_today']
        const soldOut = products?.filter(p => UNAVAILABLE_SALE_STATUSES.includes(p.sale_status))
        if (soldOut && soldOut.length > 0) {
          return new Response(
            JSON.stringify({
              error: '品切れまたは販売停止中の商品があります: ' + soldOut.map(p => p.name).join(', '),
              error_code: 'PRODUCT_SOLD_OUT',
              sold_out_products: soldOut.map(p => p.id),
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // サーバー側で合計金額を計算（product_sizesテーブルから価格を検証）
      // product_sizes から全商品の価格を取得して検証
      let priceMap: Record<string, number[]> = {}
      if (productIds.length > 0) {
        const { data: sizes } = await supabase
          .from('product_sizes')
          .select('product_id, price')
          .in('product_id', productIds)
        if (sizes) {
          for (const s of sizes) {
            if (!priceMap[s.product_id]) priceMap[s.product_id] = []
            priceMap[s.product_id].push(s.price)
          }
        }
      }

      let subtotal = 0
      for (const item of cart_items) {
        const unitPrice = item.unit_price || 0
        // クライアント送信価格がDB登録価格と一致するか検証
        // トッピング/オプション付き注文: unit_price = base_price + toppings のため、
        // オプションがある場合はベース価格以上であることを検証
        const validPrices = priceMap[item.product_id]
        if (validPrices && validPrices.length > 0) {
          const minBasePrice = Math.min(...validPrices)
          const hasOptions = item.options && (
            (Array.isArray(item.options) && item.options.length > 0) ||
            (typeof item.options === 'object' && Object.keys(item.options).length > 0)
          )
          if (hasOptions) {
            // トッピング付き: ベース価格以上であること
            if (unitPrice < minBasePrice) {
              console.error('Price below base:', { product_id: item.product_id, client_price: unitPrice, min_base: minBasePrice })
              return new Response(
                JSON.stringify({ error: '商品価格が正しくありません。ページを更新してやり直してください。' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          } else {
            // トッピングなし: ベース価格と完全一致
            if (!validPrices.includes(unitPrice)) {
              console.error('Price mismatch:', { product_id: item.product_id, client_price: unitPrice, valid_prices: validPrices })
              return new Response(
                JSON.stringify({ error: '商品価格が正しくありません。ページを更新してやり直してください。' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          }
        }
        subtotal += unitPrice * (item.quantity || 1)
      }

      // 配達料・最低注文サーチャージ（order_type: 'takeout' → DB上は 'pickup' に変換）
      const rawChannel = order_type || 'takeout'
      const channel = rawChannel === 'takeout' ? 'pickup' : rawChannel
      const deliveryFee = channel === 'delivery' ? (storeRow.delivery_fee || 0) : 0

      // 最低注文金額チェック（注文タイプ別の適用判定を含む）
      const minOrder = storeRow.min_order_amount || 0
      const minOrderPolicy = storeRow.min_order_policy || 'surcharge'
      const applyTypes = storeRow.min_order_apply_types || { dinein: false, takeout: true, delivery: true }

      // 注文タイプに対して最低注文金額が適用されるか判定
      const channelToApplyKey: Record<string, string> = { dinein: 'dinein', pickup: 'takeout', delivery: 'delivery' }
      const applyKey = channelToApplyKey[channel] || 'takeout'
      const isMinOrderApplied = applyTypes[applyKey] !== false

      let surcharge = 0
      if (isMinOrderApplied && minOrder > 0 && subtotal < minOrder) {
        if (minOrderPolicy === 'block') {
          return new Response(
            JSON.stringify({ error: `最低注文金額（¥${minOrder.toLocaleString()}）を満たしていません。あと¥${(minOrder - subtotal).toLocaleString()}分の商品を追加してください。` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // surcharge mode: 差額を手数料として加算（上限あり）
        const diff = minOrder - subtotal
        const maxSurcharge = storeRow.small_order_surcharge_max || minOrder
        surcharge = Math.min(diff, maxSurcharge)
      }

      // サービス料: 店舗設定の料率（デフォルト0%）、50円単位で切り上げ
      const serviceChargeRate = parseFloat(storeRow.service_charge_rate) || 0
      const rawServiceCharge = subtotal * serviceChargeRate
      const serviceFee = serviceChargeRate > 0 ? Math.ceil(rawServiceCharge / 50) * 50 : 0

      // クーポン割引（サーバーサイド検証 — IR-12）
      let discount = 0
      if (coupon_id && (coupon_discount || 0) > 0) {
        const { data: couponRow } = await supabase
          .from('coupons')
          .select('id, discount_value, discount_type, is_active, brand_id, min_order_amount, expires_at, usage_limit, usage_count')
          .eq('id', coupon_id)
          .single()

        // V-B G-4: クーポン再検証（NOT_FOUND / INACTIVE / EXPIRED / USAGE_EXCEEDED / MIN_ORDER_NOT_MET）
        if (!couponRow) {
          return new Response(
            JSON.stringify({ error: 'クーポンが見つかりません', error_code: 'COUPON_NOT_FOUND' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        if (!couponRow.is_active) {
          return new Response(
            JSON.stringify({ error: 'このクーポンは無効化されています', error_code: 'COUPON_INACTIVE' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // 期限切れチェック (JST 日単位): expires_at 日を含む日まで有効、翌日から無効
        if (couponRow.expires_at) {
          const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const expiryDay = new Date(couponRow.expires_at).toISOString().slice(0, 10)
          if (todayJst > expiryDay) {
            return new Response(
              JSON.stringify({ error: 'このクーポンは期限切れです', error_code: 'COUPON_EXPIRED' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        // 利用回数上限チェック
        if (couponRow.usage_limit && (couponRow.usage_count || 0) >= couponRow.usage_limit) {
          return new Response(
            JSON.stringify({ error: 'このクーポンは利用上限に達しています', error_code: 'COUPON_USAGE_EXCEEDED' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // 最低注文金額チェック
        if (couponRow.min_order_amount && subtotal < couponRow.min_order_amount) {
          return new Response(
            JSON.stringify({
              error: `このクーポンは¥${couponRow.min_order_amount.toLocaleString()}以上のご注文で利用可能です`,
              error_code: 'COUPON_MIN_ORDER_NOT_MET',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // 割引額をサーバーで再計算（クライアント値を上書き — 改ざん防止）
        const serverDiscount = couponRow.discount_type === 'percent'
          ? Math.round(subtotal * couponRow.discount_value / 100)
          : couponRow.discount_value
        if (Math.abs(serverDiscount - (coupon_discount || 0)) > 1) {
          console.warn('[coupon] client/server discount mismatch — using server value', {
            client: coupon_discount,
            server: serverDiscount,
            coupon_id,
          })
        }
        discount = serverDiscount
      } else if (!coupon_id && (coupon_discount || 0) > 0) {
        // coupon_idなしでdiscountを送ってきた場合は無視（不正利用防止）
        discount = 0
      }

      // ポイント利用（サーバーサイド残高検証 — IR-10）
      const pointsDiscount = points_used || 0
      if (member_id && pointsDiscount > 0) {
        const { data: ptRows } = await supabase
          .from('point_transactions')
          .select('amount')
          .eq('member_id', member_id)
        const ptBalance = (ptRows || []).reduce((s: number, r: any) => s + (r.amount || 0), 0)
        if (ptBalance < pointsDiscount) {
          return new Response(
            JSON.stringify({ error: 'ポイント残高が不足しています' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // 合計金額（Stripe JPYは正の整数が必要）
      const totalAmount = Math.round(Math.max(subtotal + deliveryFee + surcharge + serviceFee - discount - pointsDiscount, 0))

      console.log('Amount calculation:', { subtotal, deliveryFee, surcharge, serviceFee, discount, pointsDiscount, totalAmount, productIds, productMapKeys: Object.keys(productMap), cartItemCount: cart_items.length })

      if (totalAmount <= 0) {
        return new Response(
          JSON.stringify({ error: '合計金額が0円以下です' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 注文金額上限チェック（1回あたり）
      if (totalAmount > MAX_ORDER_AMOUNT) {
        return new Response(
          JSON.stringify({ error: `1回のご注文は${MAX_ORDER_AMOUNT.toLocaleString()}円までとなります` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // NOTE: 1日あたりのカード決済上限（MAX_DAILY_PAYMENT_AMOUNT）チェックは
      // confirm-order で実施。PaymentIntent作成時点ではcard_fingerprintが未確定のため
      // ここではチェックできない。

      // 3. Stripe Connect Account ID を取得
      let stripeAccountId: string | null = null
      const corpId = storeRow.brands?.merchant_id
      if (corpId) {
        const { data: corpRow } = await supabase
          .from('merchants')
          .select('stripe_account_id')
          .eq('id', corpId)
          .single()
        if (corpRow?.stripe_account_id) {
          stripeAccountId = corpRow.stripe_account_id
        }
      }

      // 4. 手数料計算（POC期間中はゼロ / 通常時は割引前の商品小計に対して計算 — S-06 / CLAUDE.md仕様準拠）
      let applicationFee = 0

      // POC判定: service_subscriptionsのactivated_atが30日以内かチェック
      // entity_type='corp' は legacy naming（現在はmerchants）
      let isPoc = false
      if (corpId) {
        const pocCutoff = new Date()
        pocCutoff.setDate(pocCutoff.getDate() - 30)

        const { data: subRow } = await supabase
          .from('service_subscriptions')
          .select('activated_at')
          .eq('entity_id', corpId)
          .eq('entity_type', 'corp')
          .not('activated_at', 'is', null)
          .order('activated_at', { ascending: false })
          .limit(1)
          .single()

        if (subRow?.activated_at && new Date(subRow.activated_at) > pocCutoff) {
          isPoc = true
        }
      }

      if (!isPoc && corpId) {
        const feeRate = await getFeeRate(supabase, corpId, channel)
        applicationFee = Math.round(subtotal * feeRate)
      }

      console.log('Fee calculation:', { corpId, isPoc, applicationFee })

      // 5. Stripe PaymentIntent 作成（authorize-on-order → capture-on-delivery）
      const params: Record<string, string> = {
        'amount': String(totalAmount),
        'currency': 'jpy',
        'payment_method_types[0]': 'card',
        'capture_method': 'manual',
        // 3D Secure 自動判定: Radar がリスク高と判断した場合のみ 3DS 認証を要求
        'payment_method_options[card][request_three_d_secure]': 'automatic',
      }

      if (stripeAccountId) {
        params['transfer_data[destination]'] = stripeAccountId
        if (applicationFee > 0) {
          params['application_fee_amount'] = String(applicationFee)
        }
      }

      // メタデータ
      params['metadata[venue_id]'] = store_id
      params['metadata[order_type]'] = channel
      params['metadata[delivery_fee]'] = String(deliveryFee)
      params['metadata[service_fee]'] = String(serviceFee)
      params['metadata[surcharge_amount]'] = String(surcharge)
      if (idempotency_key) params['metadata[idempotency_key]'] = idempotency_key

      const stripeHeaders: Record<string, string> = {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
      if (idempotency_key) {
        stripeHeaders['Idempotency-Key'] = idempotency_key
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: stripeHeaders,
        body: new URLSearchParams(params),
      })

      if (!stripeRes.ok) {
        const stripeErr = await stripeRes.json()
        console.error('Stripe PaymentIntent error:', stripeErr)
        return new Response(
          JSON.stringify({ error: stripeErr.error?.message || '決済の作成に失敗しました' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const pi = await stripeRes.json()

      // 6. orders テーブルに INSERT（payment_status='pending'）
      const orderPayload = {
        venue_id: store_id,
        order_type: channel,
        tracking_status: 'placed',
        payment_status: 'pending',
        total_amount: totalAmount,
        delivery_fee: deliveryFee,
        service_fee: serviceFee,
        surcharge_amount: surcharge,
        payment_intent_id: pi.id,
        customer_name: guest_info ? `${guest_info.last_name} ${guest_info.first_name}` : null,
        customer_email: guest_info?.email || null,
        customer_phone: guest_info?.phone || null,
        estimated_minutes: channel === 'delivery'
          ? (storeRow.delivery_time_min || 60)
          : (storeRow.prep_time_minutes || 30),
        delivery_address: delivery_address
          ? `${delivery_address.prefecture}${delivery_address.city}${delivery_address.address}${delivery_address.building ? ' ' + delivery_address.building : ''}`
          : null,
        aiden_points_used: aiden_points_used || 0,
        normal_points_used: normal_points_used || 0,
        member_id: member_id || null,
        channel: 'aiden',
        card_fingerprint: null,
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

      // 7. order_items テーブルに INSERT
      if (cart_items.length > 0) {
        const orderItems = cart_items.map((item: any) => ({
          order_id: orderRow.id,
          product_id: item.product_id || null,
          size_id: item.size_id || null,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          subtotal: (item.unit_price || 0) * (item.quantity || 1),
        }))
        const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
        if (itemsErr) {
          console.error('order_items insert error:', itemsErr)
        }
      }

      // 8. レスポンス返却
      return new Response(
        JSON.stringify({
          client_secret: pi.client_secret,
          payment_intent_id: pi.id,
          order_id: orderRow.id,
          display_id: orderRow.display_id,
          tracking_token: orderRow.tracking_token,
          amount: totalAmount,
          application_fee_amount: applicationFee,
          transfer_destination: stripeAccountId || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SEC: レガシーフロー（amount直接指定）は無効化 (03-P0-3)
    // クライアントから金額を直接指定するパスはセキュリティリスクのため廃止
    return new Response(
      JSON.stringify({ error: 'レガシー決済フローは無効化されました。cart_items + store_id を使用してください。' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: '決済処理でエラーが発生しました' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
