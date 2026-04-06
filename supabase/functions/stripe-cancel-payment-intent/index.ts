// Supabase Edge Function: authorize済み PaymentIntent キャンセル
// POST /functions/v1/stripe-cancel-payment-intent
//
// 補償管理の決済キャンセル機能。
// requires_capture（authorize済み+未capture）の場合のみキャンセル可。
// captured済み/既にキャンセル済みの場合は 400 エラー。
//
// 環境変数:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   AIDEN_SERVICE_ROLE_JWT / SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@14'
import {
  getCorsHeaders,
  corsPreflightResponse,
  requireAuthOrServiceRole,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証チェック
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const { payment_intent_id, reason } = await req.json()

    if (!payment_intent_id) {
      return new Response(
        JSON.stringify({ error: 'payment_intent_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Stripe API で PaymentIntent のステータス確認
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id)

    // requires_capture（authorize済み+未capture）の場合のみキャンセル可
    if (pi.status === 'canceled') {
      return new Response(
        JSON.stringify({ error: 'この決済は既にキャンセル済みです' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (pi.status !== 'requires_capture') {
      return new Response(
        JSON.stringify({
          error: 'キャンセルできるのは authorize 済み（未 capture）の決済のみです',
          current_status: pi.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Stripe PaymentIntent キャンセル実行
    const cancelParams: Stripe.PaymentIntentCancelParams = {}
    if (reason) {
      cancelParams.cancellation_reason = 'requested_by_customer'
    }
    const cancelledPi = await stripe.paymentIntents.cancel(payment_intent_id, cancelParams)

    // 3. orders テーブルの payment_status を更新
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { error: orderErr } = await sbAdmin
      .from('orders')
      .update({
        payment_status: 'cancelled',
        tracking_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', payment_intent_id)

    if (orderErr) {
      console.error('Order update error:', orderErr)
      // Stripe側はキャンセル済みなので、DB更新失敗は警告のみ
    }

    // 4. audit_logs に記録
    const { error: auditErr } = await sbAdmin
      .from('audit_logs')
      .insert({
        action: 'payment_intent_cancelled',
        entity_type: 'payment_intent',
        entity_id: payment_intent_id,
        details: {
          amount: pi.amount,
          reason: reason || null,
          stripe_status: cancelledPi.status,
        },
      })

    if (auditErr) {
      console.error('Audit log error:', auditErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        cancelled: true,
        payment_intent_id: cancelledPi.id,
        status: cancelledPi.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('stripe-cancel-payment-intent error:', err)

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
