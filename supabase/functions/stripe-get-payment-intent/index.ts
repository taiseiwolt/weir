// Supabase Edge Function: Stripe PaymentIntent ステータス取得
// POST /functions/v1/stripe-get-payment-intent
//
// 補償管理の返金/キャンセル判定用。
// Payment Intent のリアルタイムステータスと D-44 期間情報を返す。
//
// 環境変数:
//   STRIPE_SECRET_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14'
import {
  getCorsHeaders,
  corsPreflightResponse,
  requireAuthOrServiceRole,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証チェック
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const { payment_intent_id } = await req.json()

    if (!payment_intent_id) {
      return new Response(
        JSON.stringify({ error: 'payment_intent_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Stripe API で PaymentIntent 取得
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id)

    // D-44 期間ルール: 決済日からの経過日数を計算
    const createdAt = new Date(pi.created * 1000)
    const now = new Date()
    const diffMs = now.getTime() - createdAt.getTime()
    const daysSincePayment = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    return new Response(
      JSON.stringify({
        success: true,
        payment_intent_id: pi.id,
        status: pi.status,
        amount: pi.amount,
        currency: pi.currency,
        capture_method: pi.capture_method,
        created: createdAt.toISOString(),
        days_since_payment: daysSincePayment,
        metadata: pi.metadata || {},
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('stripe-get-payment-intent error:', err)

    // Stripe の resource_missing エラー
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return new Response(
        JSON.stringify({ error: '指定された PaymentIntent が見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
