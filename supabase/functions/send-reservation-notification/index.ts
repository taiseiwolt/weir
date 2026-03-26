// Supabase Edge Function: send-reservation-notification
// POST /functions/v1/send-reservation-notification
//
// 予約関連メール送信（Resend API）
// service_role認証（内部呼び出し専用）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, escapeHtml, sanitizeErrorMessage } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'support@aiden-jp.net'
const FROM_NAME = 'AIden'

interface NotificationRequest {
  type: string  // メールタイプ
  to?: string   // 顧客メールアドレス（顧客向けの場合）
  store_id?: string
  store_name?: string
  display_id?: string
  reservation_date?: string
  reservation_time?: string
  party_size?: number
  seat_type?: string
  guest_name?: string
  guest_phone?: string
  guest_email?: string
  special_requests?: string
  status?: string
  cancellation_reason?: string
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
}

function formatSeatType(type?: string): string {
  if (!type) return '指定なし'
  const map: Record<string, string> = {
    counter: 'カウンター席',
    table: 'テーブル席',
    private_room: '個室',
  }
  return map[type] || type
}

function statusLabel(status?: string): string {
  const map: Record<string, string> = {
    pending: '承認待ち',
    confirmed: '確定',
    cancelled: 'キャンセル済み',
    cancel_requested: 'キャンセルリクエスト中',
    no_show: 'ノーショー',
    completed: '来店完了',
  }
  return map[status || ''] || status || ''
}

function buildEmailHtml(title: string, greeting: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#D32F2F;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px;">AIden</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">${escapeHtml(title)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;margin:0 0 8px;">${greeting}</p>
            ${body}
            <p style="font-size:12px;color:#999;line-height:1.6;margin:24px 0 0;">
              ※ このメールは自動送信されています。<br>
              ※ ご不明な点がございましたら、店舗までお問い合わせください。
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;color:#aaa;">&copy; AIden - 飲食店向けオールインワンSaaS</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildReservationInfoHtml(data: NotificationRequest): string {
  const rows = [
    { label: '予約番号', value: data.display_id || '' },
    { label: '日時', value: `${data.reservation_date ? formatDate(data.reservation_date) : ''} ${data.reservation_time || ''}` },
    { label: '人数', value: `${data.party_size || ''}名` },
    { label: '席種', value: formatSeatType(data.seat_type) },
  ]

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin:16px 0 24px;">
      <tr><td style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${rows.map(r => `
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#888;width:100px;">${escapeHtml(r.label)}</td>
            <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(r.value)}</td>
          </tr>`).join('')}
        </table>
      </td></tr>
    </table>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const data: NotificationRequest = await req.json()

    if (!data.type) {
      return new Response(
        JSON.stringify({ error: 'type は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let toEmail = ''
    let subject = ''
    let html = ''
    const reservationInfo = buildReservationInfoHtml(data)

    switch (data.type) {
      // --- 店舗向け ---
      case 'new_reservation_store': {
        // 店舗のメールアドレスを取得
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const { data: store } = await supabase
          .from('stores')
          .select('contact_email')
          .eq('id', data.store_id)
          .single()

        toEmail = store?.contact_email || ''
        if (!toEmail) {
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: '店舗メールアドレス未設定' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        subject = `【AIden】新規予約 - ${data.display_id}`
        const guestInfo = `
          <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.8;">
            新しい予約が入りました。${data.status === 'pending' ? '承認をお願いします。' : ''}
          </p>
          ${reservationInfo}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;width:100px;">お名前</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.guest_name || '')}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">電話番号</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.guest_phone || '')}</td>
                </tr>
                ${data.guest_email ? `
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">メール</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.guest_email)}</td>
                </tr>` : ''}
                ${data.special_requests ? `
                <tr>
                  <td style="padding:4px 0;font-size:13px;color:#888;">特記事項</td>
                  <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.special_requests)}</td>
                </tr>` : ''}
              </table>
            </td></tr>
          </table>`

        html = buildEmailHtml('新規予約通知', `${escapeHtml(data.store_name || '')} 様`, guestInfo)
        break
      }

      case 'cancelled_store':
      case 'cancel_requested_store': {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const { data: store } = await supabase
          .from('stores')
          .select('contact_email')
          .eq('id', data.store_id)
          .single()

        toEmail = store?.contact_email || ''
        if (!toEmail) {
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: '店舗メールアドレス未設定' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const isCancelRequest = data.type === 'cancel_requested_store'
        subject = isCancelRequest
          ? `【AIden】キャンセルリクエスト - ${data.display_id}`
          : `【AIden】予約キャンセル - ${data.display_id}`

        const body = `
          <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.8;">
            ${isCancelRequest ? 'お客様からキャンセルリクエストが届きました。ダッシュボードから承認してください。' : '以下の予約がキャンセルされました。'}
          </p>
          ${reservationInfo}
          ${data.cancellation_reason ? `
          <p style="font-size:13px;color:#666;margin:0 0 16px;">
            <strong>キャンセル理由:</strong> ${escapeHtml(data.cancellation_reason)}
          </p>` : ''}`

        html = buildEmailHtml(
          isCancelRequest ? 'キャンセルリクエスト' : 'キャンセル通知',
          `${escapeHtml(data.store_name || '')} 様`,
          body
        )
        break
      }

      // --- 顧客向け ---
      case 'confirmed_customer': {
        toEmail = data.to || ''
        subject = `【AIden】ご予約確定のお知らせ - ${data.display_id}`
        const body = `
          <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.8;">
            ご予約が確定しました。<br>
            ${escapeHtml(data.store_name || '')} でお待ちしております。
          </p>
          ${reservationInfo}`
        html = buildEmailHtml('ご予約確定', `${escapeHtml(data.guest_name || '')} 様`, body)
        break
      }

      case 'pending_customer': {
        toEmail = data.to || ''
        subject = `【AIden】ご予約受付のお知らせ - ${data.display_id}`
        const body = `
          <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.8;">
            ご予約を受け付けました。<br>
            店舗による承認後、確定メールをお送りします。
          </p>
          ${reservationInfo}`
        html = buildEmailHtml('ご予約受付', `${escapeHtml(data.guest_name || '')} 様`, body)
        break
      }

      case 'cancelled_customer': {
        toEmail = data.to || ''
        subject = `【AIden】ご予約キャンセルのお知らせ - ${data.display_id}`
        const body = `
          <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.8;">
            ご予約がキャンセルされました。
          </p>
          ${reservationInfo}
          ${data.cancellation_reason ? `
          <p style="font-size:13px;color:#666;margin:0;">
            <strong>理由:</strong> ${escapeHtml(data.cancellation_reason)}
          </p>` : ''}`
        html = buildEmailHtml('ご予約キャンセル', `${escapeHtml(data.guest_name || '')} 様`, body)
        break
      }

      case 'cancel_requested_customer': {
        toEmail = data.to || ''
        subject = `【AIden】キャンセルリクエスト受付 - ${data.display_id}`
        const body = `
          <p style="font-size:14px;color:#555;margin:0 0 16px;line-height:1.8;">
            キャンセルリクエストを受け付けました。<br>
            店舗による確認後、結果をお知らせいたします。
          </p>
          ${reservationInfo}`
        html = buildEmailHtml('キャンセルリクエスト受付', `${escapeHtml(data.guest_name || '')} 様`, body)
        break
      }

      default:
        return new Response(
          JSON.stringify({ error: `不明なメールタイプ: ${data.type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    if (!toEmail) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: '送信先メールアドレスがありません' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // メールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(toEmail)) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: '無効なメールアドレス形式' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resend API でメール送信
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [toEmail],
        subject,
        html,
      }),
    })

    if (!resendRes.ok) {
      const resendErr = await resendRes.json()
      console.error('Resend API error:', resendErr)
      return new Response(
        JSON.stringify({ error: resendErr.message || 'メール送信に失敗しました' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await resendRes.json()

    return new Response(
      JSON.stringify({
        success: true,
        email_id: result.id,
        type: data.type,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-reservation-notification error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
