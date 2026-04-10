// Supabase Edge Function: send-reminder-email
// pg_cronから5分毎に呼び出し
//
// 予約時間の3時間前にリマインダーメールを自動送信
// 対象: 会員（members経由）+ ゲスト（guest_email）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, escapeHtml, sanitizeErrorMessage } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'support@aiden-jp.net'
const FROM_NAME = 'AIden'

function formatDateJST(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
}

function formatTimeJST(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  return `${h}:${m}`
}

function buildReminderHtml(
  name: string,
  storeName: string,
  date: string,
  time: string,
  partySize: number,
  address: string,
): string {
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(address)}`

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
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">予約確認</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;margin:0 0 8px;">
              ${escapeHtml(name)} 様
            </p>
            <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.8;">
              本日のご予約内容をお知らせいたします。
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin-bottom:24px;">
              <tr><td style="padding:16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#888;width:80px;">日時</td>
                    <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(formatDateJST(date))} ${escapeHtml(formatTimeJST(time))}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#888;">人数</td>
                    <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${partySize}名</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#888;">店舗</td>
                    <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(storeName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#888;">住所</td>
                    <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(address)}</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            ${address ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center" style="padding:8px 0;">
                  <a href="${mapsUrl}"
                     style="display:inline-block;background:#4285F4;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">
                    Google Maps で開く
                  </a>
                </td>
              </tr>
            </table>` : ''}

            <p style="font-size:12px;color:#999;line-height:1.6;margin:0;">
              ※ このメールは自動送信されています。<br>
              ※ ご予約の変更・キャンセルは店舗までお問い合わせください。
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:12px;color:#888;font-weight:600;">${escapeHtml(storeName)}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#aaa;">Powered by AIden</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 予約時間の約3時間前（±5分のウィンドウ）のものを取得
    // pg_cronが5分毎なので、3時間前の前後5分をカバー
    const { data: reservations, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        id,
        date,
        time,
        guest_count,
        name,
        guest_email,
        member_id,
        venue_id,
        venues ( name, address ),
        members:member_id ( first_name, last_name, email )
      `)
      .in('status', ['confirmed', 'pending'])
      .eq('reminder_sent', false)
      .limit(50)

    if (fetchErr) {
      console.error('Fetch reservations error:', fetchErr)
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!reservations || reservations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: '送信対象なし' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 予約時間の3時間前 ±5分のウィンドウ内か判定
    const now = new Date()
    const windowStart = new Date(now.getTime() + (2 * 60 + 55) * 60 * 1000) // +2h55m
    const windowEnd = new Date(now.getTime() + (3 * 60 + 5) * 60 * 1000)   // +3h5m

    let sentCount = 0
    const errors: string[] = []

    for (const rsv of reservations) {
      const rsvDatetime = new Date(`${rsv.date}T${rsv.time}+09:00`)
      if (rsvDatetime < windowStart || rsvDatetime > windowEnd) continue

      const member = rsv.members as { first_name: string; last_name: string; email: string } | null
      const store = rsv.venues as { name: string; address: string } | null

      // メールアドレス決定: 会員→members.email、ゲスト→guest_email
      const toEmail = member?.email || rsv.guest_email
      if (!toEmail) continue

      // 名前決定
      const name = member
        ? `${member.last_name} ${member.first_name}`.trim()
        : rsv.name || ''

      if (!name || !store?.name) continue

      const storeName = store.name
      const address = store.address || ''

      // Resend API でメール送信
      const timeStr = formatTimeJST(rsv.time)
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [toEmail],
          subject: `【予約確認】${storeName} 本日${timeStr}のご予約`,
          html: buildReminderHtml(
            name,
            storeName,
            rsv.date,
            rsv.time,
            rsv.guest_count,
            address,
          ),
        }),
      })

      if (!resendRes.ok) {
        const err = await resendRes.json()
        console.error(`Resend error for reservation ${rsv.id}:`, err)
        errors.push(`${rsv.id}: ${err.message || 'send failed'}`)
        continue
      }

      // フラグ更新
      const { error: updateErr } = await supabase
        .from('reservations')
        .update({ reminder_sent: true })
        .eq('id', rsv.id)

      if (updateErr) {
        console.error(`Update flag error for ${rsv.id}:`, updateErr)
        errors.push(`${rsv.id}: flag update failed`)
        continue
      }

      sentCount++
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-reminder-email error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
