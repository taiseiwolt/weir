// Supabase Edge Function: LINE Login - コールバック処理
// GET /functions/v1/line-auth-callback?code=xxx&state=xxx
//
// 処理フロー:
//   1. 認可コード受取
//   2. LINEトークンエンドポイントでアクセストークン取得
//   3. LINEプロフィール取得
//   4. Supabase Auth admin API でユーザー作成 or ログイン
//   5. members テーブル連携（upsert）
//   6. セッショントークン付きでフロントにリダイレクト
//
// 環境変数:
//   LINE_CHANNEL_ID, LINE_CHANNEL_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LINE_CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID')!
const LINE_CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET')!
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
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const stateParam = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // LINEからのエラー（ユーザーが拒否した場合等）
    if (error) {
      console.error('LINE auth error:', error, url.searchParams.get('error_description'))
      return redirectWithError('LINE認証がキャンセルされました', stateParam)
    }

    if (!code) {
      return redirectWithError('認可コードが取得できませんでした', stateParam)
    }

    // state からリダイレクト先を復元
    let redirectAfter = ''
    try {
      const stateJson = JSON.parse(atob(stateParam || ''))
      redirectAfter = stateJson.redirect_after || ''
    } catch (_) { /* ignore */ }

    // ===== Step 1: トークン交換 =====
    const callbackUrl = `${SUPABASE_URL}/functions/v1/line-auth-callback`
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    })

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.json()
      console.error('LINE token exchange error:', tokenErr)
      return redirectWithError('LINEトークン取得に失敗しました', stateParam)
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // ===== Step 2: プロフィール取得 =====
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!profileRes.ok) {
      console.error('LINE profile fetch error:', await profileRes.text())
      return redirectWithError('LINEプロフィール取得に失敗しました', stateParam)
    }

    const profile = await profileRes.json()
    const lineUserId = profile.userId
    const displayName = profile.displayName || ''
    const pictureUrl = profile.pictureUrl || ''

    // メールアドレス取得（IDトークンから、scopeにemail含む場合）
    let email = ''
    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(atob(tokenData.id_token.split('.')[1]))
        email = payload.email || ''
      } catch (_) { /* ignore */ }
    }

    // ===== Step 3: Supabase Auth でユーザー作成/ログイン =====
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // LINE user ID をメールライクな識別子に変換
    const lineEmail = email || `line_${lineUserId}@line.aiden.local`

    // 既存ユーザーを検索（user_metadataのline_user_idで）
    const { data: { users: existingUsers } } = await sbAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.find(
      (u: any) => u.user_metadata?.line_user_id === lineUserId
    )

    let authUser: any
    let sessionData: any

    if (existingUser) {
      // 既存ユーザー → セッション生成
      // generateLink を使ってマジックリンクトークンを生成
      const { data: tokenData, error: tokenError } = await sbAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: existingUser.email!,
      })
      if (tokenError) throw tokenError

      authUser = existingUser

      // admin API でセッション直接作成はできないので、
      // カスタムトークン方式でフロントに返す
      // ここではユーザーIDとメタデータをフロントに渡し、
      // フロントでsignInWithPassword(一時パスワード)する代わりに
      // admin API でパスワードリセット→自動ログインする

      // 一時パスワードを設定してフロントでログインさせる
      const tempPassword = crypto.randomUUID()
      await sbAdmin.auth.admin.updateUser(existingUser.id, {
        password: tempPassword,
      })

      sessionData = {
        temp_email: existingUser.email,
        temp_password: tempPassword,
        user_id: existingUser.id,
      }
    } else {
      // 新規ユーザー作成
      const tempPassword = crypto.randomUUID()
      const { data: newUser, error: createError } = await sbAdmin.auth.admin.createUser({
        email: lineEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          line_user_id: lineUserId,
          line_display_name: displayName,
          line_picture_url: pictureUrl,
          provider: 'line',
        },
      })

      if (createError) throw createError
      authUser = newUser.user

      sessionData = {
        temp_email: lineEmail,
        temp_password: tempPassword,
        user_id: authUser.id,
      }
    }

    // ===== Step 4: members テーブル upsert =====
    const { error: memberError } = await sbAdmin.from('members').upsert({
      auth_user_id: authUser.id,
      line_user_id: lineUserId,
      first_name: displayName,
      email: email || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'auth_user_id',
    })

    if (memberError) {
      console.error('members upsert error:', memberError)
    }

    // member_id を取得
    const { data: memberRow } = await sbAdmin
      .from('members')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .single()

    // ===== Step 5: フロントにリダイレクト =====
    // セッション情報をフラグメント（#）で渡す（URLパラメータはサーバーログに残るため）
    const frontendUrl = redirectAfter || '/aiden-order-checkout.html'
    const fragment = new URLSearchParams({
      line_auth: 'success',
      temp_email: sessionData.temp_email,
      temp_password: sessionData.temp_password,
      member_id: memberRow?.id || '',
      display_name: displayName,
      avatar_url: pictureUrl,
    }).toString()

    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${frontendUrl}#${fragment}`,
      },
    })
  } catch (err) {
    console.error('line-auth-callback error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function redirectWithError(message: string, stateParam: string | null): Response {
  let redirectAfter = '/aiden-order-checkout.html'
  try {
    const stateJson = JSON.parse(atob(stateParam || ''))
    redirectAfter = stateJson.redirect_after || redirectAfter
  } catch (_) { /* ignore */ }

  const fragment = new URLSearchParams({
    line_auth: 'error',
    error_message: message,
  }).toString()

  return new Response(null, {
    status: 302,
    headers: { 'Location': `${redirectAfter}#${fragment}` },
  })
}
