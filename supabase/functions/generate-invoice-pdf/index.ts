// Supabase Edge Function: PDF請求書生成
// POST /functions/v1/generate-invoice-pdf
//
// Body: { invoice_id: string }
//
// 処理:
// 1. invoicesテーブルからレコード取得 + 法人情報取得
// 2. pdf-lib でPDF請求書を生成
// 3. Supabase Storageにアップロード
// 4. invoices.pdf_url を更新

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// 日本語フォント (Noto Sans JP) を取得
async function fetchJapaneseFont(): Promise<ArrayBuffer> {
  const url = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.woff2'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch Japanese font')
  return res.arrayBuffer()
}

async function fetchJapaneseFontBold(): Promise<ArrayBuffer> {
  const url = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.woff2'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch Japanese bold font')
  return res.arrayBuffer()
}

function formatCurrency(amount: number): string {
  return '¥' + amount.toLocaleString('ja-JP')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function getBillingPeriodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `${y}年${parseInt(m)}月`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // 認証: JWT または service_role_key 必須
    const authError = await requireAuthOrServiceRole(req, corsHeaders)
    if (authError) return authError

    const body = await req.json().catch(() => ({}))
    const { invoice_id } = body

    if (!invoice_id) {
      return jsonResponse({ error: 'invoice_id は必須です' }, 400, corsHeaders)
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. 請求書データ取得
    const { data: invoice, error: invErr } = await sbAdmin
      .from('invoices')
      .select('id, merchant_id, billing_period, subtotal, adjustments, tax, total, due_date, pdf_url, adjustment_details, status')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) {
      return jsonResponse({ error: '請求書が見つかりません' }, 404, corsHeaders)
    }

    // 2. 法人情報取得
    const { data: corp } = await sbAdmin
      .from('merchants')
      .select('id, name, rep, representative, address')
      .eq('id', invoice.merchant_id)
      .single()

    const corpName = corp?.name || '不明な法人'
    const corpRep = corp?.rep || corp?.representative || ''
    const corpAddress = corp?.address || ''

    // 3. PDF生成
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)

    // フォント読み込み
    let fontRegular, fontBold
    try {
      const [fontDataRegular, fontDataBold] = await Promise.all([
        fetchJapaneseFont(),
        fetchJapaneseFontBold(),
      ])
      fontRegular = await pdfDoc.embedFont(fontDataRegular)
      fontBold = await pdfDoc.embedFont(fontDataBold)
    } catch {
      // フォールバック: 標準フォント（日本語不可だがPDFは生成可能）
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    }

    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()

    const purple = rgb(0.424, 0.361, 0.906) // #6c5ce7
    const black = rgb(0.13, 0.13, 0.13)
    const gray = rgb(0.4, 0.4, 0.4)
    const lightGray = rgb(0.93, 0.93, 0.93)
    const red = rgb(0.84, 0.18, 0.18)
    const white = rgb(1, 1, 1)

    let y = height - 50

    // --- ヘッダー: AIdenロゴ ---
    page.drawRectangle({
      x: 0, y: y - 30, width, height: 60,
      color: purple,
    })
    page.drawText('AIden', {
      x: 40, y: y - 12, size: 28, font: fontBold, color: white,
    })
    page.drawText('INVOICE', {
      x: width - 140, y: y - 8, size: 20, font: fontBold, color: white,
    })

    y -= 70

    // --- 請求書タイトル ---
    page.drawText('請求書', {
      x: 40, y, size: 24, font: fontBold, color: black,
    })

    y -= 30

    // --- 請求書番号・発行日 ---
    const issueDateStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
    page.drawText(`請求書番号: ${invoice.id.substring(0, 12)}`, {
      x: 40, y, size: 10, font: fontRegular, color: gray,
    })
    page.drawText(`発行日: ${issueDateStr}`, {
      x: width - 200, y, size: 10, font: fontRegular, color: gray,
    })
    y -= 16
    page.drawText(`対象期間: ${getBillingPeriodLabel(invoice.billing_period)}`, {
      x: 40, y, size: 10, font: fontRegular, color: gray,
    })
    page.drawText(`支払期日: ${formatDate(invoice.due_date)}`, {
      x: width - 200, y, size: 10, font: fontRegular, color: red,
    })

    y -= 35

    // --- 区切り線 ---
    page.drawLine({
      start: { x: 40, y }, end: { x: width - 40, y },
      thickness: 1, color: lightGray,
    })

    y -= 25

    // --- 請求先情報 ---
    page.drawText('請求先:', {
      x: 40, y, size: 9, font: fontRegular, color: gray,
    })
    page.drawText('請求元:', {
      x: 320, y, size: 9, font: fontRegular, color: gray,
    })

    y -= 18
    page.drawText(corpName, {
      x: 40, y, size: 13, font: fontBold, color: black,
    })
    page.drawText('AIden（運営: AIden株式会社）', {
      x: 320, y, size: 11, font: fontBold, color: black,
    })

    y -= 16
    if (corpRep) {
      page.drawText(`代表: ${corpRep} 様`, {
        x: 40, y, size: 10, font: fontRegular, color: gray,
      })
    }
    page.drawText('billing@aiden-jp.net', {
      x: 320, y, size: 9, font: fontRegular, color: gray,
    })

    y -= 14
    if (corpAddress) {
      page.drawText(corpAddress, {
        x: 40, y, size: 9, font: fontRegular, color: gray,
      })
    }

    y -= 35

    // --- 請求金額サマリ ---
    page.drawRectangle({
      x: 40, y: y - 36, width: width - 80, height: 50,
      color: purple,
      borderColor: purple,
      borderWidth: 1,
    })
    page.drawText('ご請求金額（税込）', {
      x: 60, y: y - 8, size: 12, font: fontRegular, color: white,
    })
    page.drawText(formatCurrency(invoice.total), {
      x: width - 200, y: y - 14, size: 24, font: fontBold, color: white,
    })

    y -= 60

    // --- 明細テーブル ---
    const tableX = 40
    const tableW = width - 80
    const colWidths = [tableW * 0.55, tableW * 0.2, tableW * 0.25]
    const rowHeight = 28

    // テーブルヘッダー
    page.drawRectangle({
      x: tableX, y: y - rowHeight, width: tableW, height: rowHeight,
      color: rgb(0.95, 0.95, 0.97),
    })
    page.drawText('項目', {
      x: tableX + 10, y: y - 18, size: 10, font: fontBold, color: gray,
    })
    page.drawText('数量', {
      x: tableX + colWidths[0] + 20, y: y - 18, size: 10, font: fontBold, color: gray,
    })
    page.drawText('金額', {
      x: tableX + colWidths[0] + colWidths[1] + 30, y: y - 18, size: 10, font: fontBold, color: gray,
    })

    y -= rowHeight

    // 明細行: 手数料小計
    // 注文件数を概算（手数料率4%で逆算、あるいは表示上は「一式」）
    const rows: Array<{ label: string; qty: string; amount: number }> = [
      { label: `AIdenプラットフォーム手数料（${getBillingPeriodLabel(invoice.billing_period)}）`, qty: '一式', amount: invoice.subtotal },
    ]

    // 調整項目
    const adjustmentDetails = invoice.adjustment_details || []
    for (const adj of adjustmentDetails) {
      rows.push({ label: `調整: ${adj.reason}`, qty: '', amount: adj.amount })
    }

    for (const row of rows) {
      page.drawLine({
        start: { x: tableX, y }, end: { x: tableX + tableW, y },
        thickness: 0.5, color: lightGray,
      })
      y -= rowHeight

      const textColor = row.amount < 0 ? red : black
      page.drawText(row.label.length > 40 ? row.label.substring(0, 40) + '...' : row.label, {
        x: tableX + 10, y: y + 8, size: 9, font: fontRegular, color: black,
      })
      page.drawText(row.qty, {
        x: tableX + colWidths[0] + 20, y: y + 8, size: 9, font: fontRegular, color: gray,
      })
      page.drawText(formatCurrency(row.amount), {
        x: tableX + colWidths[0] + colWidths[1] + 30, y: y + 8, size: 10, font: fontRegular, color: textColor,
      })
    }

    // 区切り線
    page.drawLine({
      start: { x: tableX, y }, end: { x: tableX + tableW, y },
      thickness: 0.5, color: lightGray,
    })

    y -= 10

    // --- 小計・税・合計 ---
    const summaryX = tableX + tableW - 200
    const summaryW = 200

    const taxableAmount = invoice.subtotal + (invoice.adjustments || 0)

    // 小計（税抜）
    y -= 18
    page.drawText('小計（税抜）', {
      x: summaryX, y, size: 10, font: fontRegular, color: gray,
    })
    page.drawText(formatCurrency(taxableAmount), {
      x: summaryX + summaryW - 10, y, size: 10, font: fontRegular, color: black,
      // right-align workaround: we use a fixed position
    })

    // 消費税
    y -= 18
    page.drawText('消費税（10%）', {
      x: summaryX, y, size: 10, font: fontRegular, color: gray,
    })
    page.drawText(formatCurrency(invoice.tax), {
      x: summaryX + summaryW - 10, y, size: 10, font: fontRegular, color: black,
    })

    // 合計
    y -= 5
    page.drawLine({
      start: { x: summaryX, y }, end: { x: summaryX + summaryW, y },
      thickness: 1.5, color: purple,
    })
    y -= 20
    page.drawText('合計（税込）', {
      x: summaryX, y, size: 12, font: fontBold, color: black,
    })
    page.drawText(formatCurrency(invoice.total), {
      x: summaryX + summaryW - 10, y, size: 14, font: fontBold, color: purple,
    })

    y -= 45

    // --- 振込先情報 ---
    page.drawRectangle({
      x: 40, y: y - 70, width: tableW, height: 85,
      color: rgb(0.97, 0.97, 0.99),
      borderColor: lightGray,
      borderWidth: 1,
    })
    page.drawText('お振込先', {
      x: 55, y: y - 5, size: 11, font: fontBold, color: black,
    })
    y -= 22
    page.drawText('銀行名: （口座開設後に記載）', {
      x: 55, y: y - 5, size: 10, font: fontRegular, color: gray,
    })
    y -= 16
    page.drawText('支店名: （口座開設後に記載）', {
      x: 55, y: y - 5, size: 10, font: fontRegular, color: gray,
    })
    y -= 16
    page.drawText('口座番号: （口座開設後に記載）', {
      x: 55, y: y - 5, size: 10, font: fontRegular, color: gray,
    })
    y -= 16
    page.drawText('口座名義: AIden株式会社', {
      x: 55, y: y - 5, size: 10, font: fontRegular, color: gray,
    })

    y -= 35

    // --- 備考 ---
    page.drawText('※ お支払期日までにお振込をお願いいたします。', {
      x: 40, y, size: 9, font: fontRegular, color: gray,
    })
    y -= 14
    page.drawText('※ この請求書はシステムにより自動生成されています。', {
      x: 40, y, size: 9, font: fontRegular, color: gray,
    })

    // --- フッター ---
    page.drawText('© AIden - 飲食店向けオールインワンSaaS', {
      x: 40, y: 30, size: 8, font: fontRegular, color: gray,
    })

    // 4. PDFバイナリ生成
    const pdfBytes = await pdfDoc.save()
    const pdfBlob = new Uint8Array(pdfBytes)

    // 5. Supabase Storageにアップロード
    const fileName = `invoices/${invoice.merchant_id}/${invoice.billing_period}_${invoice.id.substring(0, 8)}.pdf`

    const { error: uploadErr } = await sbAdmin.storage
      .from('invoices')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      // バケットが存在しない場合は作成を試みる
      if (uploadErr.message?.includes('not found') || uploadErr.statusCode === '404') {
        await sbAdmin.storage.createBucket('invoices', {
          public: false,
          fileSizeLimit: 10485760, // 10MB
        })
        // リトライ
        const { error: retryErr } = await sbAdmin.storage
          .from('invoices')
          .upload(fileName, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true,
          })
        if (retryErr) {
          return jsonResponse({ error: 'PDF Storage アップロードに失敗しました' }, 500, corsHeaders)
        }
      } else {
        return jsonResponse({ error: 'PDF Storage アップロードに失敗しました' }, 500, corsHeaders)
      }
    }

    // 署名付きURL生成（有効期限: 30日）
    const { data: signedUrlData, error: signedErr } = await sbAdmin.storage
      .from('invoices')
      .createSignedUrl(fileName, 60 * 60 * 24 * 30) // 30日

    const pdfUrl = signedUrlData?.signedUrl || ''

    if (signedErr) {
      console.error('Signed URL error:', signedErr)
    }

    // 6. invoicesテーブルのpdf_urlを更新
    await sbAdmin
      .from('invoices')
      .update({ pdf_url: pdfUrl })
      .eq('id', invoice_id)

    return jsonResponse({
      success: true,
      invoice_id,
      pdf_url: pdfUrl,
      storage_path: fileName,
    }, 200, corsHeaders)
  } catch (err) {
    console.error('Edge function error:', err)
    return jsonResponse({ error: sanitizeErrorMessage(err) }, 500, corsHeaders)
  }
})

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
