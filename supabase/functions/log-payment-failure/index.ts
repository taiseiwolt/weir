// Supabase Edge Function: 決済失敗ログ記録
// POST /functions/v1/log-payment-failure
//
// 決済が失敗した場合にフロントから呼び出し、
// payment_attempts テーブルにログを記録する。

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
