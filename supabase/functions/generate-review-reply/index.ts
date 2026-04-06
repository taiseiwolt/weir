// Edge Function: レビュー返信生成
// Claude API で3バリアント（フォーマル/カジュアル/フレンドリー）を生成

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

    const { store_id, review_text, reviewer_name, rating, review_source } = await req.json()

    if (!store_id || !review_text || !rating) {
      return new Response(
        JSON.stringify({ error: 'store_id, review_text, rating は必須です' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    // 無料枠チェック
    const quota = await checkAiQuota(sbAdmin, store_id, 'review_reply')
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.message, quota }), {
        status: 429,
        headers: jsonHeaders,
      })
    }

    // 店舗情報取得
    const ctx = await getStoreContext(sbAdmin, store_id)
    if (!ctx) {
      return new Response(JSON.stringify({ error: '店舗が見つかりません' }), {
        status: 404,
        headers: jsonHeaders,
      })
    }

    const isNegative = rating <= 2
    const tones = ['formal', 'casual', 'friendly']
    const toneLabels: Record<string, string> = {
      formal: 'フォーマル（丁寧）',
      casual: 'カジュアル',
      friendly: 'フレンドリー',
    }

    const systemPrompt = `あなたは「${ctx.storeName}」（${ctx.brandName}）のレビュー返信担当です。
店舗の特徴: ${ctx.description || '飲食店'}
人気メニュー: ${ctx.products.slice(0, 5).join('、') || '未設定'}

以下のルールを厳守してください:
- レビュー内容に含まれる個人情報（名前等）は返信に含めないこと
- 返信の長さは100〜200文字程度
- 日本語で生成すること
- 店舗名を自然に含めること
${isNegative ? '- ネガティブレビューへの対応: まず謝罪し、具体的な改善提案を含め、再来店を丁寧に促すこと' : '- ポジティブレビューへの感謝を伝え、再来店を促すこと'}`

    const userPrompt = `以下のレビューに対して、3つのトーン（${tones.map(t => toneLabels[t]).join('、')}）で返信を生成してください。

レビュー（★${rating}/5）:
${review_text}

JSON形式で出力してください:
[
  {"tone": "formal", "text": "返信文"},
  {"tone": "casual", "text": "返信文"},
  {"tone": "friendly", "text": "返信文"}
]`

    // Claude API 呼び出し
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error('Claude API error:', errBody)
      await logAiInteraction(sbAdmin, {
        store_id,
        brand_id: ctx.brandId,
        interaction_type: 'review_reply',
        input_data: { review_text, rating, review_source },
        status: 'failed',
        model: 'claude-sonnet-4-20250514',
      })
      return new Response(JSON.stringify({ error: 'AI生成に失敗しました' }), {
        status: 502,
        headers: jsonHeaders,
      })
    }

    const claudeData = await claudeRes.json()
    const content = claudeData.content?.[0]?.text || ''
    const tokensUsed = (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0)

    // JSON部分を抽出
    let variants
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      variants = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      variants = [{ tone: 'formal', text: content }]
    }

    // ai_interactionsに記録
    await logAiInteraction(sbAdmin, {
      store_id,
      brand_id: ctx.brandId,
      interaction_type: 'review_reply',
      input_data: { review_text, rating, review_source, reviewer_name },
      output_data: { variants },
      tokens_used: tokensUsed,
      model: 'claude-sonnet-4-20250514',
    })

    return new Response(
      JSON.stringify({ success: true, variants, quota: { remaining: quota.remaining !== undefined ? quota.remaining - 1 : -1, plan: quota.plan } }),
      { headers: jsonHeaders }
    )
  } catch (err) {
    console.error('generate-review-reply error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
