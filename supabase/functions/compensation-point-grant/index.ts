// Supabase Edge Function: 補償ポイント付与
// POST /functions/v1/compensation-point-grant
//
// 認証: JWT必須（管理者のみポイント付与可能）
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   SUPABASE_SERVICE_ROLE_KEY（point_transactions テーブル書き込み用）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

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

    const { member_id, brand_id, amount, reason, granted_by } = await req.json()

    if (!member_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'member_id と正のポイント数は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!reason) {
      return new Response(
        JSON.stringify({ error: '補償理由は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // IR-27: RPC関数で原子的にポイント付与（レースコンディション防止）
    const { data: rpcResult, error: rpcErr } = await sbAdmin.rpc('grant_compensation_points', {
      p_member_id: member_id,
      p_brand_id: brand_id || null,
      p_amount: amount,
      p_reason: reason || '',
      p_granted_by: granted_by || '',
    })

    if (rpcErr) {
      console.error('RPC grant error:', rpcErr)
      return new Response(
        JSON.stringify({ error: 'ポイント付与に失敗しました' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const inserted = rpcResult

    return new Response(
      JSON.stringify({
        success: true,
        new_balance: inserted?.balance_after ?? 0,
        amount: amount,
        source: 'aiden_compensation',
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
