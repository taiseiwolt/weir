// Supabase Edge Function: Stripe PaymentIntent 作成 + 注文レコード作成（Connect 対応）
// POST /functions/v1/stripe-create-payment-intent
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   STRIPE_SECRET_KEY: sk_test_xxx
//   SUPABASE_URL: https://xxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY: eyJxxx

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// AIden プラットフォーム手数料率
const AIDEN_FEE_RATES: Record<string, number> = {
  dinein: 0.038,
  takeout: 0.040,
  pickup: 0.040,
  delivery: 0.040,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
      // 後方互換: 既存の呼び出し元がある場合
      amount,
      currency,
      stripe_account_id: legacy_stripe_account_id,
      application_fee_amount: legacy_application_fee_amount,
      metadata: legacy_metadata,
    } = await req.json()

    // ── 新フロー（cart_items ベース）──
    if (cart_items && store_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

      // 1. 店舗情報取得（Stripe Connect Account ID含む）
      const { data: storeRow, error: storeErr } = await supabase
        .from('stores')
        .select('*, brands(id, name, corp_id)')
        .eq('id', store_id)
        .single()

      if (storeErr || !storeRow) {
        return new Response(
          JSON.stringify({ error: '店舗情報が見つかりません' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
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

        // 品切れチェック（sale_status が 'sold_out' の商品）
        const soldOut = products?.filter(p => p.sale_status === 'sold_out')
        if (soldOut && soldOut.length > 0) {
          return new Response(
            JSON.stringify({
              error: '品切れの商品があります: ' + soldOut.map(p => p.name).join(', '),
              sold_out_products: soldOut.map(p => p.id),
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // サーバー側で合計金額を計算（productsテーブルにpriceカラムがないためunit_priceを使用）
      let subtotal = 0
      for (const item of cart_items) {
        const unitPrice = item.unit_price || 0
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

      // サービス料: 商品小計の10%、50円単位で切り上げ
      const serviceChargeRate = 0.10
      const rawServiceCharge = subtotal * serviceChargeRate
      const serviceFee = Math.ceil(rawServiceCharge / 50) * 50

      // クーポン割引
      const discount = coupon_discount || 0

      // ポイント利用
      const pointsDiscount = points_used || 0

      // 合計金額（Stripe JPYは正の整数が必要）
      const totalAmount = Math.round(Math.max(subtotal + deliveryFee + surcharge + serviceFee - discount - pointsDiscount, 0))

      console.log('Amount calculation:', { subtotal, deliveryFee, surcharge, serviceFee, discount, pointsDiscount, totalAmount, productIds, productMapKeys: Object.keys(productMap), cartItemCount: cart_items.length })

      if (totalAmount <= 0) {
        return new Response(
          JSON.stringify({ error: '合計金額が0円以下です' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 3. Stripe Connect Account ID を取得
      let stripeAccountId: string | null = null
      const corpId = storeRow.brands?.corp_id
      if (corpId) {
        const { data: corpRow } = await supabase
          .from('corps')
          .select('stripe_account_id')
          .eq('id', corpId)
          .single()
        if (corpRow?.stripe_account_id) {
          stripeAccountId = corpRow.stripe_account_id
        }
      }

      // 4. 手数料計算
      const feeRate = AIDEN_FEE_RATES[channel] || 0.040
      const applicationFee = Math.round(totalAmount * feeRate)

      // 5. Stripe PaymentIntent 作成
      const params: Record<string, string> = {
        'amount': String(totalAmount),
        'currency': 'jpy',
        'payment_method_types[0]': 'card',
      }

      if (stripeAccountId) {
        params['transfer_data[destination]'] = stripeAccountId
        if (applicationFee > 0) {
          params['application_fee_amount'] = String(applicationFee)
        }
      }

      // メタデータ
      params['metadata[store_id]'] = store_id
      params['metadata[order_type]'] = channel
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
        store_id,
        order_type: channel,
        tracking_status: 'placed',
        payment_status: 'pending',
        total_amount: totalAmount,
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
          product_name: productMap[item.product_id]?.name || item.product_name || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          options: item.options || null,
        }))
        await supabase.from('order_items').insert(orderItems)
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

    // ── 後方互換フロー（amount 直接指定）──
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: '有効な金額を指定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const params: Record<string, string> = {
      'amount': String(amount),
      'currency': currency || 'jpy',
      'automatic_payment_methods[enabled]': 'true',
    }

    if (legacy_stripe_account_id) {
      params['transfer_data[destination]'] = legacy_stripe_account_id
      if (legacy_application_fee_amount && legacy_application_fee_amount > 0) {
        params['application_fee_amount'] = String(legacy_application_fee_amount)
      }
    }

    if (legacy_metadata) {
      for (const [key, value] of Object.entries(legacy_metadata)) {
        if (value) params[`metadata[${key}]`] = String(value)
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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

    return new Response(
      JSON.stringify({
        payment_intent_id: pi.id,
        client_secret: pi.client_secret,
        status: pi.status,
        amount: pi.amount,
        application_fee_amount: legacy_application_fee_amount || 0,
        transfer_destination: legacy_stripe_account_id || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
