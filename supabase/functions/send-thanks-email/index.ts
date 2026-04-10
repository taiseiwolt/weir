// Supabase Edge Function: send-thanks-email
// pg_cronから5分毎に呼び出し
//
// 来店完了（completed）から4時間後にサンクスメールを自動送信
// 対象: 会員のみ（member_idがNOT NULL）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, escapeHtml, sanitizeErrorMessage } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'support@aiden-jp.net'
const FROM_NAME = 'AIden'

function buildThanksHtml(customerName: string, storeName: string): string {
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
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">ご来店ありがとうございました</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;margin:0 0 8px;">
              ${escapeHtml(customerName)} 様
            </p>
            <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.8;">
              本日は${escapeHtml(storeName)}にご来店いただき、誠にありがとうございました。<br>
              またのお越しを心よりお待ちしております。
            </p>
            <p style="font-size:12px;color:#999;line-height:1.6;margin:0;">
              ※ このメールは自動送信されています。<br>
              ※ ご不明な点がございましたら、店舗までお問い合わせください。
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

    // 来店完了から4時間以上経過 & 未送信 & 会員のみ
    const { data: reservations, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        id,
        date,
        time,
        member_id,
        venue_id,
        venues ( name ),
        members:member_id ( first_name, last_name, email )
      `)
      .eq('status', 'completed')
      .eq('thanks_mail_sent', false)
      .not('member_id', 'is', null)
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

    // 4時間経過チェック（date + time でフィルタ）
    const now = new Date()
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)

    let sentCount = 0
    const errors: string[] = []

    for (const rsv of reservations) {
      const rsvDatetime = new Date(`${rsv.date}T${rsv.time}+09:00`)
      if (rsvDatetime > fourHoursAgo) continue

      const member = rsv.members as { first_name: string; last_name: string; email: string } | null
      const store = rsv.venues as { name: string } | null

      if (!member?.email || !store?.name) continue

      const customerName = `${member.last_name} ${member.first_name}`.trim()
      const storeName = store.name

      // Resend API でメール送信
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [member.email],
          subject: `【${storeName}】本日はご来店ありがとうございました`,
          html: buildThanksHtml(customerName, storeName),
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
        .update({ thanks_mail_sent: true })
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
    console.error('send-thanks-email error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
