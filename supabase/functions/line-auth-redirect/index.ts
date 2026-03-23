// Supabase Edge Function: LINE Login - 認可URL生成 → LINE遷移
// GET /functions/v1/line-auth-redirect?redirect_after=xxx
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   LINE_CHANNEL_ID
//   LINE_CHANNEL_SECRET

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { getCorsHeaders, corsPreflightResponse } from '../_shared/auth.ts'

const LINE_CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証スキップ: OAuth開始エンドポイント

  try {
    const url = new URL(req.url)
    const redirectAfter = url.searchParams.get('redirect_after') || ''

    // CSRF対策: stateにランダム値 + リダイレクト先を埋め込む
    const statePayload = JSON.stringify({
      nonce: crypto.randomUUID(),
      redirect_after: redirectAfter,
    })
    const state = btoa(statePayload)

    const callbackUrl = `${SUPABASE_URL}/functions/v1/line-auth-callback`

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINE_CHANNEL_ID,
      redirect_uri: callbackUrl,
      state: state,
      scope: 'profile openid email',
    })

    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': lineAuthUrl,
      },
    })
  } catch (err) {
    console.error('line-auth-redirect error:', err)
    return new Response(
      JSON.stringify({ error: 'LINE認証リダイレクトでエラーが発生しました' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
