// Supabase Edge Function: Stripe PaymentIntent 作成（Connect 対応）
// POST /functions/v1/stripe-create-payment-intent
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   STRIPE_SECRET_KEY（テスト/本番キーを環境変数で切替）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      amount,
      currency = 'jpy',
      stripe_account_id,
      application_fee_amount,
      metadata = {},
      capture_method = 'manual',
    } = await req.json()

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'amount は正の整数で指定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // PaymentIntent パラメータ構築
    const params = new URLSearchParams({
      'amount': String(amount),
      'currency': currency,
      'capture_method': capture_method,
    })

    // メタデータ追加
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== null && value !== undefined) {
        params.set(`metadata[${key}]`, String(value))
      }
    }

    // Stripe Connect: 加盟店アカウントへの送金設定
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    if (stripe_account_id) {
      // Connect: Destination Charge パターン
      params.set('transfer_data[destination]', stripe_account_id)
      if (application_fee_amount && application_fee_amount > 0) {
        params.set('application_fee_amount', String(application_fee_amount))
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers,
      body: params,
    })

    if (!stripeRes.ok) {
      const stripeErr = await stripeRes.json()
      console.error('Stripe PaymentIntent error:', stripeErr)
      return new Response(
        JSON.stringify({ error: stripeErr.error?.message || 'PaymentIntent の作成に失敗しました' }),
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
