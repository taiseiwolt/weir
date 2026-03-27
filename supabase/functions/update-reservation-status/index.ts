// Supabase Edge Function: update-reservation-status
// POST /functions/v1/update-reservation-status
//
// 予約ステータス変更（店舗側操作: 承認/拒否/ノーショー/完了）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ステータス遷移ルール
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'no_show', 'completed'],
  cancel_requested: ['cancelled', 'confirmed'],  // 店舗がキャンセル承認 or 拒否（確定に戻す）
}
// cancelled, no_show, completed は終了状態（遷移不可）

interface UpdateStatusRequest {
  reservation_id: string
  new_status: string
  cancelled_by?: string    // 'customer' | 'store' | 'system'
  cancellation_reason?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'POST メソッドのみ対応しています' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const data: UpdateStatusRequest = await req.json()

    if (!data.reservation_id || !data.new_status) {
      return new Response(
        JSON.stringify({ error: 'reservation_id, new_status は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 現在の予約を取得
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*, stores(name, reservation_cancellation_fee)')
      .eq('id', data.reservation_id)
      .single()

    if (fetchError || !reservation) {
      return new Response(
        JSON.stringify({ error: '予約が見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ステータス遷移チェック
    const allowed = VALID_TRANSITIONS[reservation.status]
    if (!allowed || !allowed.includes(data.new_status)) {
      return new Response(
        JSON.stringify({
          error: `ステータス「${reservation.status}」から「${data.new_status}」への変更はできません`,
          current_status: reservation.status,
          allowed_transitions: allowed || [],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 更新データ準備
    const updateData: Record<string, unknown> = {
      status: data.new_status,
    }

    // ステータス更新
    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update(updateData)
      .eq('id', data.reservation_id)
      .select('id, display_id, status, email, name')
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
      if (updated.email) {
        let emailType = ''
        if (data.new_status === 'confirmed') emailType = 'confirmed_customer'
        else if (data.new_status === 'cancelled') emailType = 'cancelled_customer'

        if (emailType) {
          await fetch(`${SUPABASE_URL}/functions/v1/send-reservation-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: emailType,
              to: updated.email,
              name: updated.name,
              store_name: reservation.stores?.name || '',
              display_id: updated.display_id,
              date: reservation.date,
              time: reservation.time,
              guest_count: reservation.guest_count,
              status: data.new_status,
              cancellation_reason: data.cancellation_reason,
            }),
          })
        }
      }
    } catch (emailErr) {
      console.error('Email notification error (non-fatal):', emailErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        reservation: {
          id: updated.id,
          display_id: updated.display_id,
          status: updated.status,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('update-reservation-status error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
