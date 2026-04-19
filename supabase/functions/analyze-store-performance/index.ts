// Edge Function: 店舗パフォーマンス AI 分析
// 顧客管理画面 sdAiAnalysis() (weir-customer-admin.html:8974) から呼出。
// 20 種類の分析タイプのうち daily のみ実装、他は not_implemented を返す（CC AI-C で順次拡張予定）。
//
// リクエスト: { type, brand_id, kpi: { sales, orders, avg } }
// レスポンス成功: { success, type, analysis, data_summary, quota }
// レスポンス未実装: { success: false, status: 'not_implemented', type, message }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  corsPreflightResponse,
  requireAuthOrServiceRole,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'
import { checkAiQuota, logAiInteraction } from '../_shared/ai-quota.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

// CC AI-C で実装される分析タイプ一覧（参考、レスポンスメッセージで使用）
const ALL_TYPES = [
  'daily', 'channel', 'hourly', 'heatmap', 'access',
  'userTrend', 'freqDist',
  'productRank', 'prodTrend', 'abc', 'prodHeatmap', 'channelProd', 'newProd',
  'bmRank', 'gap', 'radar', 'bmHourly', 'bmChannel', 'bmTrend',
  'effect',
]

// 本 EF で既に実装済みの分析タイプ。CC AI-C で追加するたびにここを更新する。
const IMPLEMENTED_TYPES = new Set(['daily'])

const TYPE_LABELS: Record<string, string> = {
  daily: '日別売上トレンド',
  channel: 'チャネル別売上',
  hourly: '時間帯別注文',
  heatmap: '曜日×時間帯ヒートマップ',
  access: 'アクセス・CVR',
  userTrend: 'ユーザー推移',
  freqDist: '注文頻度分布',
  productRank: '人気商品ランキング',
  prodTrend: '商品トレンド',
  abc: 'ABC分析',
  prodHeatmap: '商品×時間帯',
  channelProd: 'チャネル×商品',
  newProd: '新商品パフォーマンス',
  bmRank: '業界ランキング',
  gap: 'ギャップ分析',
  radar: 'レーダー比較',
  bmHourly: '時間帯比較',
  bmChannel: 'チャネル比較',
  bmTrend: 'トレンド比較',
  effect: '効果検証',
}

/**
 * brand 配下の最初の venue を返す（POC では brand 単位の分析を venue 単位に集約しないため）。
 * 本来は frontend が venue_id を渡すべきだが、現状の sdAiAnalysis() は brand_id を渡す仕様。
 */
async function resolvePrimaryVenue(sbAdmin: ReturnType<typeof createClient>, brandId: string) {
  const { data } = await sbAdmin
    .from('venues')
    .select('id, name, brand_id, genre')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

async function logUsage(
  sbAdmin: ReturnType<typeof createClient>,
  params: {
    venue_id: string | null
    brand_id: string | null
    type: string
    status: 'success' | 'error'
    input_tokens?: number
    output_tokens?: number
    error_message?: string
  },
) {
  try {
    let merchant_id: string | null = null
    if (params.brand_id) {
      const { data: bRow } = await sbAdmin
        .from('brands')
        .select('merchant_id')
        .eq('id', params.brand_id)
        .maybeSingle()
      merchant_id = bRow?.merchant_id || null
    }
    await sbAdmin.from('ai_usage_logs').insert({
      venue_id: params.venue_id,
      merchant_id,
      feature: 'analyze_store_performance',
      model: 'claude-sonnet-4-20250514',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      status: params.status,
      error_message: params.error_message?.slice(0, 500),
      metadata: { analysis_type: params.type },
    })
  } catch (err) {
    console.error('[analyze-store-performance] logUsage failed:', err)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const authError = await requireAuthOrServiceRole(req, corsHeaders)
    if (authError) return authError

    const body = await req.json()
    const type: string = body.type
    const brand_id: string | undefined = body.brand_id
    const kpi = body.kpi || {}

    if (!type || !brand_id) {
      return new Response(
        JSON.stringify({ error: 'type, brand_id は必須です' }),
        { status: 400, headers: jsonHeaders },
      )
    }

    if (!ALL_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: `不正な分析タイプ: ${type}` }),
        { status: 400, headers: jsonHeaders },
      )
    }

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    // CC AI-C 拡張前: 未実装タイプは 200 + status:'not_implemented' を返す（broken reference 解消）
    if (!IMPLEMENTED_TYPES.has(type)) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'not_implemented',
          type,
          label: TYPE_LABELS[type] || type,
          message: `分析タイプ「${TYPE_LABELS[type] || type}」は準備中です。近日公開予定。`,
        }),
        { status: 200, headers: jsonHeaders },
      )
    }

    // 以下、daily 分析の実装
    const venue = await resolvePrimaryVenue(sbAdmin, brand_id)
    if (!venue) {
      return new Response(
        JSON.stringify({ error: '対象ブランドの店舗が見つかりません' }),
        { status: 404, headers: jsonHeaders },
      )
    }

    // クォータチェック（monthly_comment と共有しないため、本 EF 専用キーは未定義 — 共通に sns_post を流用するか
    // 別途 STD_LIMITS 拡張が必要。POC では PRO/EXPERT 想定で実質スルーを許容する設計）
    const quota = await checkAiQuota(sbAdmin, venue.id as string, 'sns_post')
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: jsonHeaders,
      })
    }

    // 直近 30 日の orders を集計（daily トレンド）
    const now = new Date()
    const fromDate = new Date(now.getTime() - 30 * 86400 * 1000)

    const { data: orders } = await sbAdmin
      .from('orders')
      .select('total_amount, order_type, created_at')
      .eq('venue_id', venue.id)
      .eq('payment_status', 'captured')
      .gte('created_at', fromDate.toISOString())

    const dailyMap: Record<string, { count: number; gmv: number }> = {}
    ;(orders || []).forEach((o: { total_amount?: number; created_at: string }) => {
      const day = (o.created_at || '').slice(0, 10)
      if (!day) return
      if (!dailyMap[day]) dailyMap[day] = { count: 0, gmv: 0 }
      dailyMap[day].count += 1
      dailyMap[day].gmv += o.total_amount || 0
    })

    const dailySummary = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, count: v.count, gmv: v.gmv }))

    const totalCount = dailySummary.reduce((s, d) => s + d.count, 0)
    const totalGmv = dailySummary.reduce((s, d) => s + d.gmv, 0)
    const avgDailyGmv = dailySummary.length > 0 ? Math.round(totalGmv / dailySummary.length) : 0

    const dataSummary = {
      type,
      label: TYPE_LABELS[type],
      venue: { id: venue.id, name: (venue as { name?: string }).name || '' },
      period: { from: fromDate.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
      total_count: totalCount,
      total_gmv: totalGmv,
      avg_daily_gmv: avgDailyGmv,
      daily: dailySummary,
      kpi_from_frontend: kpi,
    }

    const systemPrompt = `あなたは飲食店経営コンサルタントです。「${(venue as { name?: string }).name || ''}」の直近 30 日の売上データを分析し、具体的な経営アドバイスを提供してください。

ルール:
- 日本語で回答すること
- データの傾向（増減、ピーク日、低調日）を 1〜2 文で要約
- 改善提案を 2〜3 個、各 1〜2 文で簡潔に
- 全体で 400 文字程度`

    const userPrompt = `直近 30 日（${fromDate.toISOString().slice(0, 10)} 〜 ${now.toISOString().slice(0, 10)}）の日別売上データを分析してください。

【期間サマリ】
- 注文数合計: ${totalCount} 件
- 売上合計 (GMV): ¥${totalGmv.toLocaleString()}
- 1 日平均売上: ¥${avgDailyGmv.toLocaleString()}
- 集計日数: ${dailySummary.length} 日

【日別 (上位/下位 5 日)】
上位売上日:
${dailySummary.slice().sort((a, b) => b.gmv - a.gmv).slice(0, 5).map(d => `- ${d.date}: ${d.count}件 / ¥${d.gmv.toLocaleString()}`).join('\n') || 'データなし'}

下位売上日:
${dailySummary.slice().sort((a, b) => a.gmv - b.gmv).slice(0, 5).map(d => `- ${d.date}: ${d.count}件 / ¥${d.gmv.toLocaleString()}`).join('\n') || 'データなし'}

【現在のリアルタイム KPI（フロントエンド表示値）】
- 売上合計: ${kpi.sales || '不明'}
- 注文件数: ${kpi.orders || '不明'}
- 平均注文単価: ${kpi.avg || '不明'}

このデータから読み取れる経営課題と改善提案を提示してください。`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error('Claude API error:', errText)
      await logAiInteraction(sbAdmin, {
        store_id: venue.id as string,
        brand_id,
        interaction_type: 'analyze_store_performance',
        input_data: { type, brand_id, kpi, data_summary: dataSummary },
        status: 'failed',
        model: 'claude-sonnet-4-20250514',
      })
      await logUsage(sbAdmin, {
        venue_id: venue.id as string,
        brand_id,
        type,
        status: 'error',
        error_message: errText,
      })
      return new Response(JSON.stringify({ error: 'AI 分析に失敗しました' }), {
        status: 502,
        headers: jsonHeaders,
      })
    }

    const claudeData = await claudeRes.json()
    const analysis = claudeData.content?.[0]?.text || ''
    const inputTokens = claudeData.usage?.input_tokens || 0
    const outputTokens = claudeData.usage?.output_tokens || 0

    await logAiInteraction(sbAdmin, {
      store_id: venue.id as string,
      brand_id,
      interaction_type: 'analyze_store_performance',
      input_data: { type, brand_id, kpi, data_summary: dataSummary },
      output_data: { analysis },
      tokens_used: inputTokens + outputTokens,
      model: 'claude-sonnet-4-20250514',
    })

    await logUsage(sbAdmin, {
      venue_id: venue.id as string,
      brand_id,
      type,
      status: 'success',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })

    return new Response(
      JSON.stringify({
        success: true,
        type,
        label: TYPE_LABELS[type],
        analysis,
        data_summary: dataSummary,
        quota: { remaining: quota.remaining !== undefined ? quota.remaining - 1 : -1, plan: quota.plan },
      }),
      { headers: jsonHeaders },
    )
  } catch (err) {
    console.error('analyze-store-performance error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: jsonHeaders },
    )
  }
})
