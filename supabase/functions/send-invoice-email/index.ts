// Supabase Edge Function: 請求書メール送信
// POST /functions/v1/send-invoice-email
//
// Body: { invoice_id: string }
//
// 処理:
// 1. invoicesテーブルからレコード取得
// 2. 法人の連絡先メールを取得（corps.rep_email → accounts.ownerのemail）
// 3. Resend APIでHTMLメール送信（請求金額サマリ + PDFダウンロードリンク）
// 4. invoices.status を 'sent' に更新

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

const FROM_EMAIL = 'billing@aiden-jp.net'
const FROM_NAME = 'AIden 請求管理'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatCurrency(amount: number): string {
  return '¥' + amount.toLocaleString('ja-JP')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getBillingPeriodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `${y}年${parseInt(m)}月`
}

function buildInvoiceEmail(data: {
  corpName: string
  repName: string
  billingPeriod: string
  subtotal: number
  adjustments: number
  tax: number
  total: number
  dueDate: string
  pdfUrl: string | null
  adjustmentDetails: Array<{ reason: string; amount: number }>
}): string {
  const periodLabel = getBillingPeriodLabel(data.billingPeriod)
  const dueDateFormatted = data.dueDate
    ? new Date(data.dueDate).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  const adjustmentsHtml = data.adjustmentDetails.length > 0
    ? data.adjustmentDetails.map(a => `
        <tr>
          <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#666;">
            調整: ${escapeHtml(a.reason)}
          </td>
          <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#D32F2F;text-align:right;font-weight:600;">
            ${formatCurrency(a.amount)}
          </td>
        </tr>`).join('')
    : ''

  const pdfSection = data.pdfUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(data.pdfUrl)}"
               style="display:inline-block;background:#6c5ce7;color:#fff;font-size:14px;font-weight:700;padding:14px 40px;border-radius:8px;text-decoration:none;">
              PDF請求書をダウンロード
            </a>
          </td>
        </tr>
       </table>`
    : `<p style="font-size:12px;color:#888;text-align:center;margin-bottom:24px;">
         ※ PDF請求書は準備中です。管理画面からダウンロードいただけます。
       </p>`

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#6c5ce7;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px;">AIden</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">月次請求書のお知らせ</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;margin:0 0 8px;">
              ${escapeHtml(data.corpName)}
              ${data.repName ? escapeHtml(data.repName) + ' 様' : '御中'}
            </p>
            <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.8;">
              いつもAIdenをご利用いただきありがとうございます。<br>
              ${periodLabel}分のご請求書をお送りいたします。
            </p>

            <!-- Invoice Summary -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border-radius:12px;margin-bottom:24px;border:1px solid #e8e6f0;">
              <tr>
                <td style="padding:20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">対象期間</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;text-align:right;">${periodLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">お支払期日</td>
                      <td style="padding:4px 0;font-size:13px;color:#D32F2F;font-weight:600;text-align:right;">${dueDateFormatted}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Breakdown -->
            <h3 style="font-size:15px;color:#333;margin:0 0 12px;font-weight:700;">ご請求内訳</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;">
                  プラットフォーム手数料（${periodLabel}）
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333;text-align:right;font-weight:600;">
                  ${formatCurrency(data.subtotal)}
                </td>
              </tr>
              ${adjustmentsHtml}
              <tr style="background:#fafafa;">
                <td style="padding:8px 16px;font-size:12px;color:#888;">消費税（10%）</td>
                <td style="padding:8px 16px;font-size:12px;color:#333;text-align:right;">${formatCurrency(data.tax)}</td>
              </tr>
              <tr style="background:#6c5ce7;">
                <td style="padding:14px 16px;font-size:15px;color:#fff;font-weight:800;">ご請求合計（税込）</td>
                <td style="padding:14px 16px;font-size:18px;color:#fff;font-weight:800;text-align:right;">${formatCurrency(data.total)}</td>
              </tr>
            </table>

            <!-- PDF Download Button -->
            ${pdfSection}

            <!-- Payment Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff9e6;border-radius:8px;border:1px solid #f0e6c0;margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#333;">お振込先</p>
                  <p style="margin:0;font-size:12px;color:#666;line-height:1.8;">
                    銀行名: （口座開設後にお知らせいたします）<br>
                    口座名義: AIden株式会社
                  </p>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#999;line-height:1.6;margin:0;">
              ※ このメールは自動送信されています。<br>
              ※ ご不明な点がございましたら billing@aiden-jp.net までお問い合わせください。
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              &copy; AIden - 飲食店向けオールインワンSaaS
            </p>
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
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { invoice_id } = body

    if (!invoice_id) {
      return jsonResponse({ error: 'invoice_id は必須です' }, 400)
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. 請求書データ取得
    const { data: invoice, error: invErr } = await sbAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) {
      return jsonResponse({ error: '請求書が見つかりません: ' + (invErr?.message || '') }, 404)
    }

    // 2. 法人情報取得
    const { data: corp } = await sbAdmin
      .from('corps')
      .select('*')
      .eq('id', invoice.corp_id)
      .single()

    // 3. 送信先メールアドレスの決定
    // 優先度: corps.rep_email → accounts(role=owner, corp_id一致).email
    let toEmail = corp?.rep_email || corp?.email || ''
    let repName = corp?.rep || corp?.representative || ''

    if (!toEmail) {
      // accountsテーブルからオーナーを探す
      const { data: ownerAccount } = await sbAdmin
        .from('accounts')
        .select('email, name')
        .eq('corp_id', invoice.corp_id)
        .eq('role', 'owner')
        .limit(1)
        .single()

      if (ownerAccount) {
        toEmail = ownerAccount.email
        if (!repName) repName = ownerAccount.name || ''
      }
    }

    if (!toEmail) {
      return jsonResponse({ error: '送信先メールアドレスが見つかりません。法人情報にメールアドレスを設定してください。' }, 400)
    }

    // 4. メール本文生成
    const periodLabel = getBillingPeriodLabel(invoice.billing_period)
    const html = buildInvoiceEmail({
      corpName: corp?.name || '不明な法人',
      repName,
      billingPeriod: invoice.billing_period,
      subtotal: invoice.subtotal,
      adjustments: invoice.adjustments || 0,
      tax: invoice.tax,
      total: invoice.total,
      dueDate: invoice.due_date,
      pdfUrl: invoice.pdf_url || null,
      adjustmentDetails: invoice.adjustment_details || [],
    })

    // 5. Resend APIでメール送信
    const subject = `【AIden】${periodLabel}分 ご請求書 - ${formatCurrency(invoice.total)}`

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
      return jsonResponse({ error: 'メール送信に失敗: ' + (resendErr.message || JSON.stringify(resendErr)) }, 400)
    }

    const result = await resendRes.json()

    // 6. ステータスを'sent'に更新
    await sbAdmin
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoice_id)

    return jsonResponse({
      success: true,
      email_id: result.id,
      sent_to: toEmail,
      invoice_id,
      subject,
    })
  } catch (err) {
    console.error('Edge function error:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
