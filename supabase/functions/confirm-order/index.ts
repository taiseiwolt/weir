// Supabase Edge Function: 決済成功後の注文ステータス更新
// POST /functions/v1/confirm-order
//
// PaymentIntent が succeeded になった後、orders.payment_status を 'paid' に更新し、
// Thanksメールを送信する。
//
// Stripe Webhook (payment_intent.succeeded) でも同じ処理を行うが、
// フロント→Edge Function の同期呼び出しも併用して即時遷移を実現する。

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    if (pi.status !== 'succeeded') {
      return new Response(
        JSON.stringify({ error: '決済が完了していません（status: ' + pi.status + '）' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. orders テーブルの payment_status を 'paid' に更新
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: orderRow, error: updateErr } = await supabase
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('payment_intent_id', payment_intent_id)
      .select('id, display_id, tracking_token, customer_email, customer_name, store_id, order_type, total_amount')
      .single()

    if (updateErr) {
      console.error('Order update error:', updateErr)
      return new Response(
        JSON.stringify({ error: '注文ステータスの更新に失敗しました' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Thanksメール送信（非同期、失敗しても注文は有効）
    try {
      // 注文商品を取得
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_name, quantity, unit_price')
        .eq('order_id', orderRow.id)

      // 店舗名を取得
      const { data: storeRow } = await supabase
        .from('stores')
        .select('name')
        .eq('id', orderRow.store_id)
        .single()

      await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          order_id: orderRow.id,
          tracking_token: orderRow.tracking_token,
          display_id: orderRow.display_id,
          customer_email: orderRow.customer_email,
          customer_name: orderRow.customer_name,
          store_name: storeRow?.name || '',
          order_type: orderRow.order_type,
          total_amount: orderRow.total_amount,
          items: (orderItems || []).map(i => ({
            name: i.product_name,
            qty: i.quantity,
            price: i.unit_price,
          })),
        }),
      })
    } catch (emailErr) {
      console.warn('Order email skipped:', emailErr)
    }

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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
