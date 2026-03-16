// Supabase Edge Function: LINE Login - 認可URL生成 → LINE遷移
// GET /functions/v1/line-auth-redirect?redirect_after=xxx
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   LINE_CHANNEL_ID: 2009451269
//   LINE_CHANNEL_SECRET: 8eeb009bae9d1e311c087fb0f13bf741

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const LINE_CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
