// Supabase Edge Function: Stripe Connect オンボーディングリンク再生成
// POST /functions/v1/stripe-connect-onboarding
//
// 認証: JWT必須（認証済みユーザーのみ）
//
// 既存のStripeアカウントに対してオンボーディングリンクを再生成する
// （期限切れやリフレッシュ時に使用）
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   STRIPE_SECRET_KEY（テスト/本番キーを環境変数で切替）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'https://aiden-jp.net'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // JWT または service_role_key による認証
    const authError = await requireAuthOrServiceRole(req, corsHeaders)
    if (authError) return authError

    const { corp_id, stripe_account_id } = await req.json()

    // stripe_account_id が直接指定されていない場合は corp_id から取得
    let accountId = stripe_account_id
    if (!accountId && corp_id) {
      const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: corp } = await sbAdmin
        .from('corps')
        .select('stripe_account_id')
        .eq('id', corp_id)
        .single()

      if (!corp?.stripe_account_id) {
        return new Response(
          JSON.stringify({ error: 'Stripeアカウントが見つかりません。先にアカウントを作成してください。' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      accountId = corp.stripe_account_id
    }

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'stripe_account_id または corp_id が必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Account Link（オンボーディングURL）を生成
    const linkParams = new URLSearchParams({
      'account': accountId,
      'refresh_url': `${FRONTEND_URL}/aiden-customer-admin.html?stripe_refresh=true`,
      'return_url': `${FRONTEND_URL}/aiden-customer-admin.html?stripe_onboarding=complete&account_id=${accountId}`,
      'type': 'account_onboarding',
    })

    const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: linkParams,
    })

    if (!linkRes.ok) {
      const stripeErr = await linkRes.json()
      console.error('Stripe AccountLink error:', stripeErr)
      return new Response(
        JSON.stringify({ error: stripeErr.error?.message || 'オンボーディングリンクの生成に失敗しました' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const linkData = await linkRes.json()

    // アカウントの現在のステータスも取得
    const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      },
    })

    let charges_enabled = false
    let details_submitted = false
    if (accountRes.ok) {
      const accountData = await accountRes.json()
      charges_enabled = accountData.charges_enabled
      details_submitted = accountData.details_submitted
    }

    return new Response(
      JSON.stringify({
        onboarding_url: linkData.url,
        account_id: accountId,
        charges_enabled,
        details_submitted,
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
