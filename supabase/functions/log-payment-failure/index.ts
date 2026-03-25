// Supabase Edge Function: 決済失敗ログ記録
// POST /functions/v1/log-payment-failure
//
// 決済が失敗した場合にフロントから呼び出し、
// payment_attempts テーブルにログを記録する。

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, corsPreflightResponse, verifyJwt, verifyServiceRole } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証: service_role_key, JWT, apikey ヘッダー, または Authorization の anon key
  // ゲスト注文（未ログイン）の決済失敗ログ記録にも対応
  const isService = verifyServiceRole(req)

  if (!isService) {
    // Supabase API Gateway が apikey ヘッダーを付与するため、それで認証OK
    const apikeyHeader = req.headers.get('apikey')
    const authHeader = req.headers.get('Authorization')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const token = authHeader ? authHeader.replace('Bearer ', '') : ''

    const hasValidApikey = apikeyHeader && apikeyHeader.length > 0
    const isAnonAuth = token === anonKey

    if (!hasValidApikey && !isAnonAuth) {
      const { user, error: authError } = await verifyJwt(req)
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: authError || '認証が必要です' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  try {
    const body = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { error } = await supabase.from('payment_attempts').insert({
      store_id: body.store_id || null,
      email: body.email || null,
      phone: body.phone || null,
      order_type: body.order_type || null,
      total_amount: body.total_amount || null,
      payment_intent_id: body.payment_intent_id || null,
      failure_reason: body.failure_reason || null,
      card_last4: body.card_last4 || null,
      card_brand: body.card_brand || null,
      idempotency_key: body.idempotency_key || null,
    })

    if (error) {
      console.error('payment_attempts insert error:', error)
      return new Response(
        JSON.stringify({ error: 'ログの記録に失敗しました' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('log-payment-failure error:', err)
    return new Response(
      JSON.stringify({ error: 'ログ記録処理でエラーが発生しました' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
