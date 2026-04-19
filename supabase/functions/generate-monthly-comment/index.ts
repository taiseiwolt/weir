// Edge Function: 月次AIコメント生成
// 注文データ + レビュー傾向を分析し、Claude APIで経営アドバイスを生成

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  corsPreflightResponse,
  requireAuthOrServiceRole,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'
import { checkAiQuota, logAiInteraction, getStoreContext } from '../_shared/ai-quota.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const authError = await requireAuthOrServiceRole(req, corsHeaders)
    if (authError) return authError

    const body = await req.json()
    // venue_id 優先、後方互換で store_id も受理
    const store_id = body.venue_id || body.store_id
    const { month } = body

    if (!store_id || !month) {
      return new Response(
        JSON.stringify({ error: 'venue_id, month (YYYY-MM) は必須です' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    // month format check
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return new Response(
        JSON.stringify({ error: 'month は YYYY-MM 形式で指定してください' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const quota = await checkAiQuota(sbAdmin, store_id, 'monthly_comment')
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: jsonHeaders,
      })
    }

    const ctx = await getStoreContext(sbAdmin, store_id)
    if (!ctx) {
      return new Response(JSON.stringify({ error: '店舗が見つかりません' }), {
        status: 404,
        headers: jsonHeaders,
      })
    }

    // 対象月の日付範囲
    const monthStart = `${month}-01T00:00:00Z`
    const [year, mon] = month.split('-').map(Number)
    const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`
    const monthEnd = `${nextMonth}-01T00:00:00Z`

    // 注文データ集計
    const { data: orders } = await sbAdmin
      .from('orders')
      .select('id, total_amount, order_type, created_at')
      .eq('venue_id', store_id)
      .eq('payment_status', 'captured')
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)

    const orderCount = orders?.length || 0
    const gmv = orders?.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0) || 0
    const avgOrderValue = orderCount > 0 ? Math.round(gmv / orderCount) : 0

    // 注文タイプ別集計
    const orderByType: Record<string, number> = {}
    ;(orders || []).forEach((o: any) => {
      const t = o.order_type || 'unknown'
      orderByType[t] = (orderByType[t] || 0) + 1
    })

    // 人気商品
    const { data: topProducts } = await sbAdmin
      .from('order_items')
      .select('product_name, quantity')
      .in(
        'order_id',
        (orders || []).map((o: any) => o.id)
      )

    const productCounts: Record<string, number> = {}
    ;(topProducts || []).forEach((item: any) => {
      productCounts[item.product_name] = (productCounts[item.product_name] || 0) + (item.quantity || 1)
    })
    const topProductList = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    // Google レビュー傾向
    let reviewSummary = { avgRating: 0, count: 0, recentTexts: [] as string[] }
    const { data: storeData } = await sbAdmin
      .from('venues')
      .select('google_place_id')
      .eq('id', store_id)
      .single()

    if (storeData?.google_place_id) {
      const { data: reviews } = await sbAdmin
        .from('google_reviews')
        .select('rating, text')
        .eq('place_id', storeData.google_place_id)
        .gte('published_at', monthStart)
        .lt('published_at', monthEnd)
        .order('published_at', { ascending: false })
        .limit(10)

      if (reviews && reviews.length > 0) {
        const totalRating = reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0)
        reviewSummary = {
          avgRating: Math.round((totalRating / reviews.length) * 10) / 10,
          count: reviews.length,
          recentTexts: reviews.slice(0, 3).map((r: any) => r.text || '').filter(Boolean),
        }
      }
    }

    const dataSummary = {
      month,
      order_count: orderCount,
      gmv,
      avg_order_value: avgOrderValue,
      order_by_type: orderByType,
      top_products: topProductList,
      review: reviewSummary,
    }

    // Claude API で経営アドバイス生成
    const systemPrompt = `あなたは飲食店経営コンサルタントです。「${ctx.storeName}」（${ctx.brandName}）の月次データを分析し、具体的で実行可能な経営アドバイスを提供してください。

ルール:
- 日本語で回答すること
- データに基づいた具体的なアドバイスを3つ提供すること
- 各アドバイスは実行可能なアクションを含むこと
- 前向きなトーンを維持しつつ、改善点も率直に指摘すること
- 500文字程度でまとめること`

    const userPrompt = `${month}の実績データを分析してください:

【注文実績】
- 注文数: ${orderCount}件
- 売上(GMV): ¥${gmv.toLocaleString()}
- 平均注文単価: ¥${avgOrderValue.toLocaleString()}
- 注文タイプ別: ${Object.entries(orderByType).map(([k, v]) => `${k}: ${v}件`).join(', ') || 'データなし'}

【人気商品TOP5】
${topProductList.length > 0 ? topProductList.map((p, i) => `${i + 1}. ${p.name} (${p.count}個)`).join('\n') : 'データなし'}

【Google口コミ】
- 平均評価: ${reviewSummary.avgRating || 'データなし'}
- 件数: ${reviewSummary.count}件
${reviewSummary.recentTexts.length > 0 ? '- 最新口コミ要約:\n' + reviewSummary.recentTexts.map(t => `  「${t.slice(0, 80)}...」`).join('\n') : ''}

上記データを踏まえて、経営改善のためのアドバイスを3つ提供してください。`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error('Claude API error:', errText)
      await logAiInteraction(sbAdmin, {
        store_id,
        brand_id: ctx.brandId,
        interaction_type: 'monthly_comment',
        input_data: { month, data_summary: dataSummary },
        status: 'failed',
        model: 'claude-sonnet-4-20250514',
      })
      // ai_usage_logs にエラー記録 (ベストエフォート)
      try {
        const { data: vRow } = await sbAdmin
          .from('venues')
          .select('id, brand_id')
          .eq(store_id.startsWith('STR-') ? 'display_id' : 'id', store_id)
          .maybeSingle()
        const { data: bRow } = vRow?.brand_id
          ? await sbAdmin.from('brands').select('merchant_id').eq('id', vRow.brand_id).maybeSingle()
          : { data: null }
        await sbAdmin.from('ai_usage_logs').insert({
          venue_id: vRow?.id || null,
          merchant_id: bRow?.merchant_id || null,
          feature: 'monthly_comment',
          model: 'claude-sonnet-4-20250514',
          status: 'error',
          error_message: errText.slice(0, 500),
          metadata: { month },
        })
      } catch (logErr) { console.error('[generate-monthly-comment] error log failed:', logErr) }
      return new Response(JSON.stringify({ error: 'AI生成に失敗しました' }), {
        status: 502,
        headers: jsonHeaders,
      })
    }

    const claudeData = await claudeRes.json()
    const comment = claudeData.content?.[0]?.text || ''
    const inputTokens = claudeData.usage?.input_tokens || 0
    const outputTokens = claudeData.usage?.output_tokens || 0
    const tokensUsed = inputTokens + outputTokens

    await logAiInteraction(sbAdmin, {
      store_id,
      brand_id: ctx.brandId,
      interaction_type: 'monthly_comment',
      input_data: { month, data_summary: dataSummary },
      output_data: { comment },
      tokens_used: tokensUsed,
      model: 'claude-sonnet-4-20250514',
    })

    // venue UUID を再解決（resolveStoreId 同等の挙動 — display_id 渡し対応）
    const { data: venueRow } = await sbAdmin
      .from('venues')
      .select('id')
      .eq(store_id.startsWith('STR-') ? 'display_id' : 'id', store_id)
      .single()
    const venueUuid = venueRow?.id || null

    // ai_monthly_comments へキャッシュ (ベストエフォート)
    if (venueUuid && ctx.brandId) {
      const [yearStr, monthStr] = month.split('-')
      const { error: cacheErr } = await sbAdmin
        .from('ai_monthly_comments')
        .upsert(
          {
            venue_id: venueUuid,
            brand_id: ctx.brandId,
            year: parseInt(yearStr, 10),
            month: parseInt(monthStr, 10),
            comment_text: comment,
            model: 'claude-sonnet-4-20250514',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          },
          { onConflict: 'venue_id,year,month' }
        )
      if (cacheErr) console.error('[generate-monthly-comment] ai_monthly_comments upsert failed:', cacheErr)
    }

    // ai_usage_logs にも記録 (ベストエフォート)
    if (venueUuid) {
      const { data: brandRow } = await sbAdmin
        .from('brands')
        .select('merchant_id')
        .eq('id', ctx.brandId)
        .maybeSingle()
      const merchantUuid = brandRow?.merchant_id || null
      const { error: usageErr } = await sbAdmin.from('ai_usage_logs').insert({
        venue_id: venueUuid,
        merchant_id: merchantUuid,
        feature: 'monthly_comment',
        model: 'claude-sonnet-4-20250514',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        status: 'success',
        metadata: { month },
      })
      if (usageErr) console.error('[generate-monthly-comment] ai_usage_logs insert failed:', usageErr)
    }

    return new Response(
      JSON.stringify({
        success: true,
        comment,
        data_summary: dataSummary,
        quota: { remaining: quota.remaining !== undefined ? quota.remaining - 1 : -1, plan: quota.plan },
      }),
      { headers: jsonHeaders }
    )
  } catch (err) {
    console.error('generate-monthly-comment error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
