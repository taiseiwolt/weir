// Supabase Edge Function: Stripe Refund 実行
// POST /functions/v1/stripe-create-refund
//
// 認証: JWT必須（管理者のみ返金操作可能）
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   STRIPE_SECRET_KEY（テスト/本番キーを環境変数で切替）
//   SUPABASE_SERVICE_ROLE_KEY（orders テーブル更新用）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // JWT または service_role_key による認証
    const authError = await requireAuthOrServiceRole(req, corsHeaders)
    if (authError) return authError

    const { payment_intent_id, amount, reason, order_id, refunded_by } = await req.json()

    if (!payment_intent_id) {
      return new Response(
        JSON.stringify({ error: 'payment_intent_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SEC: 返金金額が注文のtotal_amountを超えていないか検証 (03-P1-3)
    if (order_id && amount && amount > 0) {
      const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: orderRow } = await sbAdmin
        .from('orders')
        .select('total_amount')
        .eq('id', order_id)
        .single()
      if (orderRow && amount > orderRow.total_amount) {
        return new Response(
          JSON.stringify({ error: '返金金額が注文金額を超えています' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Stripe Refund パラメータ構築
    const params: Record<string, string> = {
      'payment_intent': payment_intent_id,
    }

    // 部分返金の場合
    if (amount && amount > 0) {
      params['amount'] = String(amount)
    }

    if (reason) {
      params['metadata[reason]'] = reason
    }

    // Stripe Refund API 呼び出し（IR-25: Idempotency-Key で二重返金防止）
    const idempotencyKey = order_id
      ? `${order_id}_refund_${amount || 'full'}`
      : `${payment_intent_id}_refund_${Date.now()}`

    const stripeRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: new URLSearchParams(params),
    })

    if (!stripeRes.ok) {
      const stripeErr = await stripeRes.json()
      console.error('Stripe Refund error:', stripeErr)
      return new Response(
        JSON.stringify({ error: stripeErr.error?.message || '返金処理に失敗しました' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const refund = await stripeRes.json()

    // orders テーブルの payment_status を更新
    if (order_id) {
      const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const paymentStatus = amount ? 'partially_refunded' : 'refunded'

      const { error: dbError } = await sbAdmin
        .from('orders')
        .update({
          payment_status: paymentStatus,
          refund_amount: refund.amount,
          refund_reason: reason || null,
          refunded_at: new Date().toISOString(),
          refunded_by: refunded_by || null,
        })
        .eq('id', order_id)

      if (dbError) {
        console.error('DB update error:', dbError)
      }
    }

    // SEC: audit_logsへ返金記録 (03-P1-4, 05-P1-4)
    if (order_id) {
      try {
        await sbAdmin.from('audit_logs').insert({
          action: 'refund_executed',
          target_table: 'orders',
          target_id: order_id,
          details: {
            refund_id: refund.id,
            amount: refund.amount,
            reason: reason || null,
            refunded_by: refunded_by || null,
            payment_intent_id,
          },
          user_email: refunded_by || null,
        })
      } catch (_) { /* non-fatal */ }
    }

    return new Response(
      JSON.stringify({
        refund_id: refund.id,
        status: refund.status,
        amount: refund.amount,
        payment_intent_id: payment_intent_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
