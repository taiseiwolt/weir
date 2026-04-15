// Supabase Edge Function: send-order-email
// POST /functions/v1/send-order-email
//
// Resend API 経由で注文確認メール・領収書メールを送信
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = 'noreply@weir.co.jp'
const FROM_NAME = 'Weir'

interface OrderItem {
  name: string
  qty: number
  price: number
  options?: string
}

interface EmailRequest {
  type: 'confirmation' | 'receipt'
  to: string
  customer_name: string
  order_id: string
  store_name: string
  brand_name: string
  items: OrderItem[]
  subtotal: number
  delivery_fee?: number
  discount?: number
  points_used?: number
  total: number
  order_mode: string
  payment_method?: string
  payment_status?: string
  paid_at?: string
  review_token?: string
  review_url_base?: string
  tracking_token?: string
}

function formatCurrency(amount: number): string {
  return '¥' + amount.toLocaleString('ja-JP')
}

function buildItemsHtml(items: OrderItem[]): string {
  return items.map(item => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">
        ${escapeHtml(item.name)}${item.options ? `<br><span style="font-size:12px;color:#888;">${escapeHtml(item.options)}</span>` : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#555;text-align:center;white-space:nowrap;">
        ×${item.qty}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right;white-space:nowrap;">
        ${formatCurrency(item.price * item.qty)}
      </td>
    </tr>
  `).join('')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildConfirmationEmail(data: EmailRequest): string {
  const modeLabel = data.order_mode === 'delivery' ? 'デリバリー' : data.order_mode === 'dinein' ? '店内飲食' : 'テイクアウト'

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
          <td style="background:#D32F2F;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px;">Weir</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">注文確認メール</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;margin:0 0 8px;">
              ${escapeHtml(data.customer_name)} 様
            </p>
            <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.8;">
              ご注文ありがとうございます。<br>
              以下の内容でご注文を承りました。
            </p>

            <!-- Order Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;width:120px;">注文ID</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.order_id)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">店舗</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.store_name)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">注文方法</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${modeLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">ステータス</td>
                      <td style="padding:4px 0;font-size:13px;color:#D32F2F;font-weight:600;">注文受付済み</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <h3 style="font-size:15px;color:#333;margin:0 0 12px;font-weight:700;">ご注文内容</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#fafafa;">
                <th style="padding:10px 16px;font-size:12px;color:#888;text-align:left;font-weight:600;">商品</th>
                <th style="padding:10px 16px;font-size:12px;color:#888;text-align:center;font-weight:600;">数量</th>
                <th style="padding:10px 16px;font-size:12px;color:#888;text-align:right;font-weight:600;">金額</th>
              </tr>
              ${buildItemsHtml(data.items)}
            </table>

            <!-- Totals -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#555;">小計</td>
                <td style="padding:6px 0;font-size:14px;color:#333;text-align:right;">${formatCurrency(data.subtotal)}</td>
              </tr>
              ${data.delivery_fee ? `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#555;">配送料</td>
                <td style="padding:6px 0;font-size:14px;color:#333;text-align:right;">${formatCurrency(data.delivery_fee)}</td>
              </tr>` : ''}
              ${data.discount ? `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;">クーポン割引</td>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;text-align:right;">-${formatCurrency(data.discount)}</td>
              </tr>` : ''}
              ${data.points_used ? `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;">ポイント利用</td>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;text-align:right;">-${data.points_used}pt</td>
              </tr>` : ''}
              <tr>
                <td colspan="2" style="border-top:2px solid #D32F2F;padding:0;"></td>
              </tr>
              <tr>
                <td style="padding:12px 0;font-size:18px;color:#333;font-weight:800;">合計</td>
                <td style="padding:12px 0;font-size:18px;color:#D32F2F;font-weight:800;text-align:right;">${formatCurrency(data.total)}</td>
              </tr>
            </table>

            ${data.tracking_token ? `
            <!-- Tracking CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center" style="padding:8px 0;">
                  <a href="https://xorder.co.jp/weir-order-tracking.html?token=${data.tracking_token}"
                     style="display:inline-block;background:#D32F2F;color:#fff;font-size:14px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
                    注文状況を確認する
                  </a>
                </td>
              </tr>
            </table>` : ''}

            <p style="font-size:12px;color:#999;line-height:1.6;margin:0;">
              ※ このメールは自動送信されています。<br>
              ※ ご不明な点がございましたら、店舗までお問い合わせください。
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              &copy; Weir - 飲食店向けオールインワンSaaS
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildReceiptEmail(data: EmailRequest): string {
  const modeLabel = data.order_mode === 'delivery' ? 'デリバリー' : data.order_mode === 'dinein' ? '店内飲食' : 'テイクアウト'
  const paidAt = data.paid_at ? new Date(data.paid_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  const reviewSection = data.review_token ? `
            <!-- Review CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#FFF5F5,#FFEBEE);border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:24px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#333;">お食事はいかがでしたか？</p>
                  <p style="margin:0 0 16px;font-size:13px;color:#666;line-height:1.6;">
                    口コミを投稿していただくと、ポイントをプレゼント！
                  </p>
                  <a href="https://xorder.co.jp/review?token=${data.review_token}"
                     style="display:inline-block;background:#D32F2F;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">
                    口コミを投稿する
                  </a>
                </td>
              </tr>
            </table>` : ''

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
          <td style="background:#D32F2F;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px;">Weir</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">領収書</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;margin:0 0 8px;">
              ${escapeHtml(data.customer_name)} 様
            </p>
            <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.8;">
              お支払いが完了しました。<br>
              以下が領収書となります。
            </p>

            <!-- Order Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;width:120px;">注文ID</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.order_id)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">店舗</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.store_name)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">注文方法</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${modeLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">決済方法</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${escapeHtml(data.payment_method || 'クレジットカード')}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">決済日時</td>
                      <td style="padding:4px 0;font-size:13px;color:#333;font-weight:600;">${paidAt}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#888;">ステータス</td>
                      <td style="padding:4px 0;font-size:13px;color:#2ECC71;font-weight:600;">決済完了</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <h3 style="font-size:15px;color:#333;margin:0 0 12px;font-weight:700;">ご注文内容</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#fafafa;">
                <th style="padding:10px 16px;font-size:12px;color:#888;text-align:left;font-weight:600;">商品</th>
                <th style="padding:10px 16px;font-size:12px;color:#888;text-align:center;font-weight:600;">数量</th>
                <th style="padding:10px 16px;font-size:12px;color:#888;text-align:right;font-weight:600;">金額</th>
              </tr>
              ${buildItemsHtml(data.items)}
            </table>

            <!-- Totals -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#555;">小計</td>
                <td style="padding:6px 0;font-size:14px;color:#333;text-align:right;">${formatCurrency(data.subtotal)}</td>
              </tr>
              ${data.delivery_fee ? `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#555;">配送料</td>
                <td style="padding:6px 0;font-size:14px;color:#333;text-align:right;">${formatCurrency(data.delivery_fee)}</td>
              </tr>` : ''}
              ${data.discount ? `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;">クーポン割引</td>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;text-align:right;">-${formatCurrency(data.discount)}</td>
              </tr>` : ''}
              ${data.points_used ? `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;">ポイント利用</td>
                <td style="padding:6px 0;font-size:14px;color:#2ECC71;text-align:right;">-${data.points_used}pt</td>
              </tr>` : ''}
              <tr>
                <td colspan="2" style="border-top:2px solid #D32F2F;padding:0;"></td>
              </tr>
              <tr>
                <td style="padding:12px 0;font-size:18px;color:#333;font-weight:800;">合計（税込）</td>
                <td style="padding:12px 0;font-size:18px;color:#D32F2F;font-weight:800;text-align:right;">${formatCurrency(data.total)}</td>
              </tr>
            </table>

            ${reviewSection}

            <p style="font-size:12px;color:#999;line-height:1.6;margin:0;">
              ※ この領収書は電子的に発行されたものです。<br>
              ※ このメールは自動送信されています。<br>
              ※ ご不明な点がございましたら、店舗までお問い合わせください。
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              &copy; Weir - 飲食店向けオールインワンSaaS
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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // service_role認証（内部呼び出し）
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const data: EmailRequest = await req.json()

    if (!data.to || !data.order_id || !data.type) {
      return new Response(
        JSON.stringify({ error: 'to, order_id, type は必須です', received: { to: !!data.to, order_id: !!data.order_id, type: !!data.type } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // メールアドレス形式バリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.to)) {
      return new Response(
        JSON.stringify({ error: '無効なメールアドレス形式です', to: data.to }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const subject = data.type === 'receipt'
      ? `【Weir】領収書 - ご注文 #${data.order_id}`
      : `【Weir】ご注文確認 - #${data.order_id}`

    const html = data.type === 'receipt'
      ? buildReceiptEmail(data)
      : buildConfirmationEmail(data)

    // Resend API でメール送信
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [data.to],
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
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
