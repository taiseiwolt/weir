// Supabase Edge Function: Stripe Billing 請求書一覧取得
// POST /functions/v1/stripe-list-invoices
//
// 管理マスタの請求管理画面（Phase 5）で使用。
// 法人の stripe_customer_id から Stripe Invoices を取得し、
// line_items から店舗名・プラン・金額を抽出して返す。
//
// 環境変数:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   AIDEN_SERVICE_ROLE_JWT / SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@14'
import {
  getCorsHeaders,
  corsPreflightResponse,
  requireAuthOrServiceRole,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // 認証チェック
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const { corp_id, status, limit } = await req.json()

    if (!corp_id) {
      return new Response(
        JSON.stringify({ error: 'corp_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. corporations テーブルから stripe_customer_id を取得
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: corp, error: corpErr } = await sbAdmin
      .from('corporations')
      .select('id, name, stripe_customer_id')
      .eq('id', corp_id)
      .single()

    if (corpErr || !corp) {
      return new Response(
        JSON.stringify({ error: '法人情報が見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!corp.stripe_customer_id) {
      return new Response(
        JSON.stringify({ success: true, invoices: [], message: 'Stripe顧客未登録' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Stripe API で請求書一覧取得
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    const listParams: Stripe.InvoiceListParams = {
      customer: corp.stripe_customer_id,
      limit: Math.min(limit || 20, 100),
    }
    if (status) {
      listParams.status = status
    }

    const invoiceList = await stripe.invoices.list(listParams)

    // 3. 各請求書から店舗名・プラン・金額を抽出
    const invoices = invoiceList.data.map((inv: any) => {
      const lineItems = (inv.lines?.data || []).map((line: any) => ({
        description: line.description || '',
        amount: line.amount,
        quantity: line.quantity,
        period_start: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
        period_end: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
      }))

      return {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount_due: inv.amount_due,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        created: new Date(inv.created * 1000).toISOString(),
        due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        paid_at: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
          : null,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        line_items: lineItems,
      }
    })

    return new Response(
      JSON.stringify({ success: true, invoices }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('stripe-list-invoices error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
