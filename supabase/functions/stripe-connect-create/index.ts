// Supabase Edge Function: Stripe Connect Express アカウント作成 + オンボーディングリンク生成
// POST /functions/v1/stripe-connect-create
//
// 認証: JWT必須（認証済みユーザーのみ）
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   STRIPE_SECRET_KEY（テスト/本番キーを環境変数で切替）
//   SUPABASE_SERVICE_ROLE_KEY（corps テーブル更新用）

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

    const reqBody = await req.json()
    // merchant_id 優先、後方互換で corp_id も受理
    const corp_id = reqBody.merchant_id || reqBody.corp_id
    const { business_name, email } = reqBody

    if (!corp_id) {
      return new Response(
        JSON.stringify({ error: 'merchant_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Stripe Express アカウントを作成
    const accountParams = new URLSearchParams({
      'type': 'express',
      'country': 'JP',
      'capabilities[card_payments][requested]': 'true',
      'capabilities[transfers][requested]': 'true',
      'business_type': 'company',
      'metadata[aiden_merchant_id]': corp_id,
    })
    if (email) accountParams.set('email', email)
    if (business_name) accountParams.set('business_profile[name]', business_name)

    const accountRes = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: accountParams,
    })

    if (!accountRes.ok) {
      const stripeErr = await accountRes.json()
      console.error('Stripe Account creation error:', stripeErr)
      return new Response(
        JSON.stringify({ error: stripeErr.error?.message || 'アカウント作成に失敗しました' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const account = await accountRes.json()

    // 2. merchants テーブルに stripe_account_id を保存
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error: dbError } = await sbAdmin
      .from('merchants')
      .update({ stripe_account_id: account.id })
      .eq('id', corp_id)

    if (dbError) {
      console.error('DB update error:', dbError)
    }

    // 3. Account Link（オンボーディングURL）を生成
    const linkParams = new URLSearchParams({
      'account': account.id,
      'refresh_url': `${FRONTEND_URL}/aiden-customer-admin.html?stripe_refresh=true`,
      'return_url': `${FRONTEND_URL}/aiden-customer-admin.html?stripe_onboarding=complete&account_id=${account.id}`,
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

    let onboarding_url = null
    if (linkRes.ok) {
      const linkData = await linkRes.json()
      onboarding_url = linkData.url
    }

    return new Response(
      JSON.stringify({
        account_id: account.id,
        onboarding_url,
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
