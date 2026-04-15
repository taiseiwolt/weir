// Supabase Edge Function: 月次請求書生成
// POST /functions/v1/generate-monthly-invoice
//
// Body: { billing_period?: "2026-02" }  ← 省略時は前月
//
// 処理:
// 1. 対象期間の全注文を法人別に集計
// 2. Weir手数料 = 各注文の application_fee_amount の合計
// 3. 調整: 返金かつWeir負担の注文分を控除
// 4. Weir原資ポイント使用分を自動控除
// 5. 消費税10%加算
// 6. invoices テーブルに INSERT

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// 手数料率（チャネル別） - フォールバック用
const FEE_RATES: Record<string, number> = {
  takeout: 0.040,
  dinein: 0.038,
  delivery: 0.040,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // service_role認証（cron/admin呼び出し）
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 対象期間の決定（デフォルト: 前月）
    let billingPeriod = body.billing_period
    if (!billingPeriod) {
      const now = new Date()
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      billingPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`
    }

    const [year, month] = billingPeriod.split('-').map(Number)
    const periodStart = new Date(year, month - 1, 1).toISOString()
    const periodEnd = new Date(year, month, 1).toISOString()

    // 支払期日 = 翌月末
    const dueDate = new Date(year, month + 1, 0) // 翌月の最終日
    const dueDateStr = dueDate.toISOString().split('T')[0]

    // 1. 全法人を取得
    const { data: corps, error: corpsErr } = await sbAdmin
      .from('merchants')
      .select('id, name')

    if (corpsErr) {
      return jsonResponse({ error: '法人取得に失敗: ' + sanitizeErrorMessage(corpsErr) }, 500)
    }

    if (!corps || corps.length === 0) {
      return jsonResponse({ message: '対象法人なし', invoices: [] })
    }

    // 2. 対象期間の全注文を取得
    const { data: orders, error: ordersErr } = await sbAdmin
      .from('orders')
      .select('id, merchant_id, brand_id, venue_id, total_amount, application_fee_amount, order_type, payment_status, aiden_points_used, created_at')
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd)

    if (ordersErr) {
      return jsonResponse({ error: '注文取得に失敗: ' + sanitizeErrorMessage(ordersErr) }, 500)
    }

    // 3. Weir原資ポイント消費を取得（source='aiden_compensation' かつ amount < 0 = 消費）
    const { data: pointTxns, error: ptErr } = await sbAdmin
      .from('point_transactions')
      .select('amount, order_id')
      .eq('source', 'aiden_compensation')
      .lt('amount', 0)

    if (ptErr) {
      console.error('Point transactions query error:', ptErr)
    }

    // order_id → aiden_compensation 消費ポイント額（負値）のマップ
    const weirPointsByOrder: Record<string, number> = {}
    if (pointTxns) {
      for (const pt of pointTxns) {
        if (pt.order_id) {
          weirPointsByOrder[pt.order_id] = (weirPointsByOrder[pt.order_id] || 0) + Math.abs(pt.amount)
        }
      }
    }

    // store → corp/brand マッピング用
    const { data: stores } = await sbAdmin
      .from('venues')
      .select('id, brand_id')
    const { data: brands } = await sbAdmin
      .from('brands')
      .select('id, merchant_id')

    const storeToInfo: Record<string, { brandId: string; corpId: string }> = {}
    const brandToCorpMap: Record<string, string> = {}
    if (brands) {
      for (const b of brands) {
        brandToCorpMap[b.id] = b.merchant_id
      }
    }
    if (stores) {
      for (const s of stores) {
        storeToInfo[s.id] = {
          brandId: s.brand_id,
          corpId: brandToCorpMap[s.brand_id] || '',
        }
      }
    }

    // 4. 法人別に集計
    const corpInvoices: Record<string, {
      subtotal: number
      adjustments: number
      adjustmentDetails: Array<{ reason: string; amount: number }>
    }> = {}

    for (const corp of corps) {
      corpInvoices[corp.id] = { subtotal: 0, adjustments: 0, adjustmentDetails: [] }
    }

    const allOrders = orders || []
    for (const order of allOrders) {
      // 法人IDの解決: order.merchant_id → store → brand → merchant
      let corpId = order.merchant_id
      if (!corpId && order.venue_id) {
        const info = storeToInfo[order.venue_id]
        if (info) corpId = info.corpId
      }
      if (!corpId) continue
      if (!corpInvoices[corpId]) {
        corpInvoices[corpId] = { subtotal: 0, adjustments: 0, adjustmentDetails: [] }
      }

      // 手数料計算
      let fee = order.application_fee_amount || 0
      if (fee === 0 && order.total_amount) {
        // フォールバック: fee率から計算
        const rate = FEE_RATES[order.order_type || 'takeout'] || 0.04
        fee = Math.round(order.total_amount * rate)
      }

      // 返金済みかつWeir負担の場合は手数料を控除
      if (order.payment_status === 'refunded') {
        corpInvoices[corpId].adjustments -= fee
        corpInvoices[corpId].adjustmentDetails.push({
          reason: `返金控除 (注文: ${order.id})`,
          amount: -fee,
        })
        continue // この注文の手数料は加算しない
      }

      corpInvoices[corpId].subtotal += fee

      // Weir原資ポイント消費分の控除
      const weirPoints = weirPointsByOrder[order.id] || 0
      if (weirPoints > 0) {
        corpInvoices[corpId].adjustments -= weirPoints
        corpInvoices[corpId].adjustmentDetails.push({
          reason: `Weir原資ポイント控除 (注文: ${order.id})`,
          amount: -weirPoints,
        })
      }
    }

    // 5. invoices テーブルに INSERT
    const results = []
    for (const corp of corps) {
      const inv = corpInvoices[corp.id]
      if (!inv || inv.subtotal === 0) continue // 注文がない法人はスキップ

      const taxableAmount = inv.subtotal + inv.adjustments
      const tax = Math.round(Math.max(0, taxableAmount) * 0.10) // 消費税10%
      const total = taxableAmount + tax

      const { data: inserted, error: insertErr } = await sbAdmin
        .from('invoices')
        .insert({
          merchant_id: corp.id,
          corp_name_snapshot: corp.name,
          billing_period: billingPeriod,
          subtotal: inv.subtotal,
          adjustments: inv.adjustments,
          tax: tax,
          total: total,
          status: 'draft',
          due_date: dueDateStr,
          adjustment_details: inv.adjustmentDetails,
        })
        .select()
        .single()

      if (insertErr) {
        console.error(`Invoice insert error for ${corp.id}:`, insertErr)
        results.push({ corp_id: corp.id, corp_name: corp.name, error: insertErr.message })
      } else {
        results.push({
          corp_id: corp.id,
          corp_name: corp.name,
          invoice_id: inserted.id,
          subtotal: inv.subtotal,
          adjustments: inv.adjustments,
          tax,
          total,
        })
      }
    }

    // 6. PDF生成 + メール送信を非同期で連鎖実行
    const pdfEmailResults = []
    const authHeader = req.headers.get('Authorization') || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    for (const r of results) {
      if (r.error || !r.invoice_id) continue
      try {
        // PDF生成
        const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ invoice_id: r.invoice_id }),
        })
        const pdfData = await pdfRes.json()

        // メール送信
        const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ invoice_id: r.invoice_id }),
        })
        const emailData = await emailRes.json()

        pdfEmailResults.push({
          invoice_id: r.invoice_id,
          corp_name: r.corp_name,
          pdf: pdfData.success ? 'ok' : pdfData.error,
          email: emailData.success ? `sent to ${emailData.sent_to}` : emailData.error,
        })
      } catch (chainErr) {
        console.error(`PDF/Email chain error for ${r.invoice_id}:`, chainErr)
        pdfEmailResults.push({
          invoice_id: r.invoice_id,
          corp_name: r.corp_name,
          pdf: 'error',
          email: 'error',
          detail: (chainErr as Error).message,
        })
      }
    }

    return jsonResponse({
      billing_period: billingPeriod,
      due_date: dueDateStr,
      invoices_created: results.filter(r => !r.error).length,
      results,
      pdf_email_results: pdfEmailResults,
    })
  } catch (err) {
    console.error('Edge function error:', err)
    return jsonResponse({ error: sanitizeErrorMessage(err) }, 500)
  }

  function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
