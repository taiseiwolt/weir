// Supabase Edge Function: create-reservation
// POST /functions/v1/create-reservation
//
// 新規来店予約を作成する
// 認証不要（ゲスト予約可能）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, sanitizeErrorMessage } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface CreateReservationRequest {
  store_id: string
  date: string           // YYYY-MM-DD
  time: string           // HH:MM
  guest_count: number
  name: string
  phone: string
  email?: string
  notes?: string
  member_id?: string
}

function generateDisplayId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 7; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `RSV-${id}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'POST メソッドのみ対応しています' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const data: CreateReservationRequest = await req.json()

    // バリデーション
    if (!data.store_id || !data.date || !data.time || !data.guest_count || !data.name || !data.phone) {
      return new Response(
        JSON.stringify({ error: 'store_id, date, time, guest_count, name, phone は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (data.guest_count < 1) {
      return new Response(
        JSON.stringify({ error: '人数は1以上を指定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 日付バリデーション
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(data.date)) {
      return new Response(
        JSON.stringify({ error: '日付は YYYY-MM-DD 形式で指定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 時刻バリデーション
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(data.time)) {
      return new Response(
        JSON.stringify({ error: '時刻は HH:MM 形式で指定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 店舗の予約設定を確認
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, name, reservation_enabled, reservation_confirmation_mode, reservation_require_card')
      .eq('id', data.store_id)
      .single()

    if (storeError || !store) {
      return new Response(
        JSON.stringify({ error: '店舗が見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!store.reservation_enabled) {
      return new Response(
        JSON.stringify({ error: 'この店舗では予約を受け付けていません' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // display_id 生成（重複チェック付き）
    let displayId = generateDisplayId()
    let retries = 0
    while (retries < 5) {
      const { data: existing } = await supabase
        .from('reservations')
        .select('id')
        .eq('display_id', displayId)
        .maybeSingle()
      if (!existing) break
      displayId = generateDisplayId()
      retries++
    }

    // ステータス決定
    const status = store.reservation_confirmation_mode === 'auto' ? 'confirmed' : 'pending'

    // 予約作成
    const insertData: Record<string, unknown> = {
      store_id: data.store_id,
      display_id: displayId,
      date: data.date,
      time: data.time,
      guest_count: data.guest_count,
      name: data.name,
      phone: data.phone,
      status,
    }
    if (data.email) insertData.email = data.email
    if (data.notes) insertData.notes = data.notes
    if (data.member_id) insertData.member_id = data.member_id

    const { data: reservation, error: insertError } = await supabase
      .from('reservations')
      .insert(insertData)
      .select('id, display_id, status')
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: sanitizeErrorMessage(insertError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // メール通知（非同期、失敗しても予約自体は成功扱い）
    try {
      // 店舗への通知
      await fetch(`${SUPABASE_URL}/functions/v1/send-reservation-notification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'new_reservation_store',
          store_id: data.store_id,
          store_name: store.name,
          display_id: displayId,
          date: data.date,
          time: data.time,
          guest_count: data.guest_count,
          name: data.name,
          phone: data.phone,
          email: data.email,
          notes: data.notes,
          status,
        }),
      })

      // 顧客へ確認メール（メールアドレスがある場合のみ）
      if (data.email) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-reservation-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: status === 'confirmed' ? 'confirmed_customer' : 'pending_customer',
            to: data.email,
            name: data.name,
            store_name: store.name,
            display_id: displayId,
            date: data.date,
            time: data.time,
            guest_count: data.guest_count,
            status,
          }),
        })
      }
    } catch (emailErr) {
      console.error('Email notification error (non-fatal):', emailErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        reservation: {
          id: reservation.id,
          display_id: reservation.display_id,
          status: reservation.status,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-reservation error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
