// Supabase Edge Function: send-escalation-email
// POST /functions/v1/send-escalation-email
//
// Resend API 経由でエスカレーション通知メールを送信
//
// 環境変数: RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'noreply@weir.co.jp'
const FROM_NAME = 'Weir CS'
const TO_EMAIL = 'support@weir.co.jp'

interface ChatMessage {
  role: string
  content: string
  created_at: string
}

interface EscalationRequest {
  session_id: string
  store_name: string
  session_type: string
  recent_messages: ChatMessage[]
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function buildMessagesHtml(messages: ChatMessage[]): string {
  return messages.reverse().map(m => {
    const roleLabel = m.role === 'user' ? 'ユーザー' : m.role === 'assistant' ? 'AI' : 'システム'
    const bgColor = m.role === 'user' ? '#E3F2FD' : '#F5F5F5'
    return `
      <div style="background:${bgColor};border-radius:8px;padding:12px 16px;margin-bottom:8px;">
        <div style="font-size:11px;color:#888;margin-bottom:4px;">
          <strong>${roleLabel}</strong> — ${formatDate(m.created_at)}
        </div>
        <div style="font-size:14px;color:#333;line-height:1.6;">
          ${escapeHtml(m.content.substring(0, 500))}
        </div>
      </div>
    `
  }).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // service_role認証（内部呼び出し）
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const data: EscalationRequest = await req.json()
    const { session_id, store_name, session_type, recent_messages } = data

    const typeLabel = session_type === 'merchant' ? '事業者' : 'エンドユーザー'
    const subject = `【Weir CS】エスカレーション - ${store_name}`

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#D32F2F;padding:24px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px;">Weir CS</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">エスカレーション通知</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-size:15px;color:#333;margin:0 0 24px;line-height:1.8;">
              AIチャットでエスカレーションが発生しました。確認・対応をお願いします。
            </p>

            <!-- Session Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;width:140px;">セッションID</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(session_id.substring(0, 8))}...</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">ユーザータイプ</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${typeLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">店舗</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(store_name)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">発生日時</td>
                      <td style="padding:4px 0;font-size:13px;color:#D32F2F;font-weight:600;">${formatDate(new Date().toISOString())}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Recent Messages -->
            <h3 style="font-size:15px;color:#333;margin:0 0 12px;font-weight:700;">直近のチャット内容</h3>
            ${buildMessagesHtml(recent_messages || [])}

            <!-- Action -->
            <div style="text-align:center;margin-top:24px;">
              <a href="https://weir.co.jp/aiden-admin.html#cs"
                 style="display:inline-block;background:#D32F2F;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                管理画面で確認する
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#fafafa;text-align:center;">
            <p style="margin:0;font-size:12px;color:#999;">
              このメールはWeir CSシステムから自動送信されています。
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    // Send via Resend API
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [TO_EMAIL],
        subject,
        html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend API error:', errText)
      return new Response(
        JSON.stringify({ error: 'Email send failed', detail: errText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await resendRes.json()
    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-escalation-email error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
