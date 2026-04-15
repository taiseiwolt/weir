// Supabase Edge Function: send-withdrawal-email
// POST /functions/v1/send-withdrawal-email
//
// 退会フロー関連のメール送信（申請確認・7日前リマインド・退会完了）
//
// 環境変数:
//   RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'noreply@weir.co.jp'
const FROM_NAME = 'Weir'

interface WithdrawalEmailRequest {
  type: 'requested' | 'reminder' | 'completed'
  to: string
  member_name: string
  scheduled_date?: string // YYYY-MM-DD format
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildRequestedEmail(data: WithdrawalEmailRequest): { subject: string; html: string } {
  const subject = '【Weir】退会申請を受け付けました'
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#D32F2F;padding:24px;text-align:center">
    <div style="color:#fff;font-size:20px;font-weight:700">Weir</div>
  </td></tr>
  <tr><td style="padding:32px 24px">
    <p style="font-size:16px;font-weight:700;margin:0 0 16px">${escapeHtml(data.member_name)} 様</p>
    <p style="font-size:14px;line-height:1.8;color:#333;margin:0 0 24px">
      退会申請を受け付けました。<br>
      <strong>${escapeHtml(data.scheduled_date || '')}</strong> に退会が確定します。
    </p>
    <div style="background:#FFF3E0;border-radius:8px;padding:16px;margin:0 0 24px">
      <p style="font-size:13px;line-height:1.8;color:#E65100;margin:0">
        ⚠ 退会確定日までの間は、マイページからいつでもキャンセルできます。<br>
        ⚠ 退会が確定するとポイントは失効し、未使用クーポンは無効になります。<br>
        ⚠ 退会確定日まではサービスを通常通りご利用いただけます。
      </p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="https://weir.co.jp/weir-mypage.html" style="display:inline-block;padding:14px 36px;background:#D32F2F;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">マイページを確認する</a>
    </div>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:16px 24px;text-align:center">
    <p style="font-size:11px;color:#999;margin:0">このメールは Weir から自動送信されています。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, html }
}

function buildReminderEmail(data: WithdrawalEmailRequest): { subject: string; html: string } {
  const subject = '【Weir】退会確定まであと7日です'
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#D32F2F;padding:24px;text-align:center">
    <div style="color:#fff;font-size:20px;font-weight:700">Weir</div>
  </td></tr>
  <tr><td style="padding:32px 24px">
    <p style="font-size:16px;font-weight:700;margin:0 0 16px">${escapeHtml(data.member_name)} 様</p>
    <p style="font-size:14px;line-height:1.8;color:#333;margin:0 0 24px">
      退会確定日まで <strong>あと7日</strong> です。<br>
      <strong>${escapeHtml(data.scheduled_date || '')}</strong> に退会が確定します。
    </p>
    <div style="background:#FFF3E0;border-radius:8px;padding:16px;margin:0 0 24px">
      <p style="font-size:13px;line-height:1.8;color:#E65100;margin:0">
        キャンセルをご希望の場合は、退会確定日までにマイページから操作してください。
      </p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="https://weir.co.jp/weir-mypage.html" style="display:inline-block;padding:14px 36px;background:#D32F2F;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">マイページを確認する</a>
    </div>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:16px 24px;text-align:center">
    <p style="font-size:11px;color:#999;margin:0">このメールは Weir から自動送信されています。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, html }
}

function buildCompletedEmail(data: WithdrawalEmailRequest): { subject: string; html: string } {
  const subject = '【Weir】退会が確定しました'
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#D32F2F;padding:24px;text-align:center">
    <div style="color:#fff;font-size:20px;font-weight:700">Weir</div>
  </td></tr>
  <tr><td style="padding:32px 24px">
    <p style="font-size:16px;font-weight:700;margin:0 0 16px">${escapeHtml(data.member_name)} 様</p>
    <p style="font-size:14px;line-height:1.8;color:#333;margin:0 0 24px">
      退会が確定しました。<br>
      ご利用ありがとうございました。
    </p>
    <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:0 0 24px">
      <p style="font-size:13px;line-height:1.8;color:#666;margin:0">
        ・ポイント残高は失効しました<br>
        ・未使用クーポンは無効になりました<br>
        ・データは90日間保持された後、匿名化されます
      </p>
    </div>
    <p style="font-size:14px;line-height:1.8;color:#333;margin:0">
      またのご利用をお待ちしております。
    </p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:16px 24px;text-align:center">
    <p style="font-size:11px;color:#999;margin:0">このメールは Weir から自動送信されています。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, html }
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
    const body: WithdrawalEmailRequest = await req.json()
    const { type, to, member_name } = body

    if (!type || !to || !member_name) {
      return new Response(JSON.stringify({ error: 'type, to, member_name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let email: { subject: string; html: string }
    switch (type) {
      case 'requested':
        email = buildRequestedEmail(body)
        break
      case 'reminder':
        email = buildReminderEmail(body)
        break
      case 'completed':
        email = buildCompletedEmail(body)
        break
      default:
        return new Response(JSON.stringify({ error: `Invalid type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject: email.subject,
        html: email.html,
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      console.error('Resend API error:', errBody)
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: errBody }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendData = await resendRes.json()
    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Error:', e)
    return new Response(JSON.stringify({ error: sanitizeErrorMessage(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
