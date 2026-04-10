// Supabase Edge Function: cancel-reservation
// POST /functions/v1/cancel-reservation
//
// 顧客側キャンセル
// display_id ベースで認証不要（予約番号を知っている人のみ操作可能）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, sanitizeErrorMessage } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface CancelRequest {
  reservation_id?: string
  display_id?: string
  cancellation_reason?: string
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
    const data: CancelRequest = await req.json()

    if (!data.reservation_id && !data.display_id) {
      return new Response(
        JSON.stringify({ error: 'reservation_id または display_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 予約を取得
    let query = supabase
      .from('reservations')
      .select('*, venues(name, reservation_cancel_deadline_hours, reservation_cancellation_fee)')

    if (data.display_id) {
      query = query.eq('display_id', data.display_id)
    } else {
      query = query.eq('id', data.reservation_id)
    }

    const { data: reservation, error: fetchError } = await query.single()

    if (fetchError || !reservation) {
      return new Response(
        JSON.stringify({ error: '予約が見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // キャンセル可能なステータスか確認
    if (!['pending', 'confirmed'].includes(reservation.status)) {
      return new Response(
        JSON.stringify({
          error: 'この予約はキャンセルできません',
          current_status: reservation.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 予約日時までの時間を計算
    const reservationDateTime = new Date(`${reservation.date}T${reservation.time}:00+09:00`)
    const now = new Date()
    const hoursUntilReservation = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const deadlineHours = reservation.venues?.reservation_cancel_deadline_hours ?? 72

    let newStatus: string
    let responseMessage: string

    if (hoursUntilReservation >= deadlineHours) {
      // 締め切り前 → 自動キャンセル
      newStatus = 'cancelled'
      responseMessage = '予約をキャンセルしました'
    } else {
      // 締め切り後 → 店舗承認待ち
      newStatus = 'cancel_requested'
      responseMessage = 'キャンセルリクエストを受け付けました。店舗の承認をお待ちください'
    }

    // ステータス更新
    const updateData: Record<string, unknown> = {
      status: newStatus,
    }

    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update(updateData)
      .eq('id', reservation.id)
      .select('id, display_id, status')
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(
        JSON.stringify({ error: sanitizeErrorMessage(updateError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // メール通知（非同期）
    try {
      // 店舗にキャンセル通知
      await fetch(`${SUPABASE_URL}/functions/v1/send-reservation-notification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: newStatus === 'cancelled' ? 'cancelled_store' : 'cancel_requested_store',
          store_id: reservation.venue_id,
          store_name: reservation.venues?.name || '',
          display_id: reservation.display_id,
          date: reservation.date,
          time: reservation.time,
          guest_count: reservation.guest_count,
          name: reservation.name,
          cancellation_reason: data.cancellation_reason,
        }),
      })

      // 顧客にキャンセル確認メール
      if (reservation.email) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-reservation-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: newStatus === 'cancelled' ? 'cancelled_customer' : 'cancel_requested_customer',
            to: reservation.email,
            name: reservation.name,
            store_name: reservation.venues?.name || '',
            display_id: reservation.display_id,
            date: reservation.date,
            time: reservation.time,
            guest_count: reservation.guest_count,
            status: newStatus,
          }),
        })
      }
    } catch (emailErr) {
      console.error('Email notification error (non-fatal):', emailErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: responseMessage,
        reservation: {
          id: updated.id,
          display_id: updated.display_id,
          status: updated.status,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('cancel-reservation error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
