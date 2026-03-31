import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY')!

interface PushPayload {
  order_id: string
  store_id: string
  display_id: string
  total_amount: number
  order_type: string
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // store_id に紐づく FCM トークンを取得
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .eq('store_id', payload.store_id)

  if (error || !tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orderTypeLabel = payload.order_type === 'dine_in' ? 'イートイン' : 'テイクアウト'
  const amountLabel = `¥${payload.total_amount.toLocaleString('ja-JP')}`
  const body = `${payload.display_id} · ${orderTypeLabel} · ${amountLabel}`

  // FCM v1 API を使用（旧 Legacy API は 2024年廃止）
  const fcmEndpoint = 'https://fcm.googleapis.com/fcm/send'
  const tokenList = tokens.map((t) => t.token)

  let sentCount = 0
  const errors: string[] = []

  // トークンを500件ずつバッチ送信
  for (let i = 0; i < tokenList.length; i += 500) {
    const batch = tokenList.slice(i, i + 500)
    try {
      const fcmResp = await fetch(fcmEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${FCM_SERVER_KEY}`,
        },
        body: JSON.stringify({
          registration_ids: batch,
          notification: {
            title: '新しい注文が届きました',
            body,
            sound: 'default',
          },
          data: {
            order_id: payload.order_id,
            store_id: payload.store_id,
            display_id: payload.display_id,
            type: 'new_order',
          },
          priority: 'high',
        }),
      })

      if (fcmResp.ok) {
        const result = await fcmResp.json()
        sentCount += result.success ?? 0
      } else {
        errors.push(`FCM error: ${fcmResp.status}`)
      }
    } catch (e) {
      errors.push(String(e))
    }
  }

  return new Response(
    JSON.stringify({ sent: sentCount, errors: errors.length > 0 ? errors : undefined }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
