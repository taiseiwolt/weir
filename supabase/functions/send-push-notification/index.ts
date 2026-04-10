import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface PushPayload {
  order_id: string
  store_id: string
  display_id: string
  total_amount: number
  order_type: string
}

interface ServiceAccount {
  project_id: string
  private_key: string
  client_email: string
}

/** Base64url encode (no padding) */
function base64url(data: Uint8Array): string {
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Build and sign a JWT for Google OAuth 2.0 using crypto.subtle */
async function createSignedJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const enc = new TextEncoder()
  const headerB64 = base64url(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Import PEM private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(unsignedToken))
  )

  return `${unsignedToken}.${base64url(signature)}`
}

/** Exchange JWT for an OAuth 2.0 access token */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const jwt = await createSignedJwt(sa)
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OAuth token error: ${resp.status} ${text}`)
  }
  const data = await resp.json()
  return data.access_token
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: PushPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Parse service account JSON from env
  const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!saJson) {
    return new Response(JSON.stringify({ error: 'FCM_SERVICE_ACCOUNT not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const sa: ServiceAccount = JSON.parse(saJson)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // venue_id に紐づく FCM トークンを取得
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .eq('venue_id', payload.store_id)

  if (error || !tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orderTypeLabel = payload.order_type === 'dine_in' ? 'イートイン' : 'テイクアウト'
  const amountLabel = `¥${payload.total_amount.toLocaleString('ja-JP')}`
  const body = `${payload.display_id} · ${orderTypeLabel} · ${amountLabel}`

  // FCM V1 API
  const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  let accessToken: string
  try {
    accessToken = await getAccessToken(sa)
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // トークンごとに並列送信
  const results = await Promise.allSettled(
    tokens.map((t) =>
      fetch(fcmEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: {
              title: '新しい注文が届きました',
              body,
            },
            data: {
              order_id: payload.order_id,
              store_id: payload.store_id,
              display_id: payload.display_id,
              type: 'new_order',
            },
            android: { priority: 'HIGH' },
            apns: {
              payload: { aps: { sound: 'default' } },
            },
          },
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`FCM ${r.status}: ${await r.text()}`)
        return r
      })
    )
  )

  const sentCount = results.filter((r) => r.status === 'fulfilled').length
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String(r.reason))

  return new Response(
    JSON.stringify({ sent: sentCount, errors: errors.length > 0 ? errors : undefined }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
