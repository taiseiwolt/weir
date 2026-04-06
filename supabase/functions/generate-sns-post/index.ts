// Edge Function: SNS投稿生成
// Claude API で3バリアント生成。プラットフォーム別文字数制限対応。

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

const CHAR_LIMITS: Record<string, number> = {
  x: 140,
  instagram: 2200,
  line: 500,
}

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X（旧Twitter）',
  instagram: 'Instagram',
  line: 'LINE公式アカウント',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const authError = await requireAuthOrServiceRole(req, corsHeaders)
    if (authError) return authError

    const { store_id, platform, topic, existing_posts } = await req.json()

    if (!store_id || !platform) {
      return new Response(
        JSON.stringify({ error: 'store_id, platform は必須です' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    if (!CHAR_LIMITS[platform]) {
      return new Response(
        JSON.stringify({ error: 'platform は x, instagram, line のいずれかを指定してください' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const quota = await checkAiQuota(sbAdmin, store_id, 'sns_post')
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

    const charLimit = CHAR_LIMITS[platform]
    const platformLabel = PLATFORM_LABELS[platform]

    const systemPrompt = `あなたは「${ctx.storeName}」（${ctx.brandName}）のSNS運用担当です。
店舗の特徴: ${ctx.description || '飲食店'}
人気メニュー: ${ctx.products.slice(0, 5).join('、') || '未設定'}

以下のルールを厳守してください:
- ${platformLabel}向けの投稿を生成すること
- 文字数は${charLimit}文字以内（ハッシュタグ含む）
- 日本語で生成すること
- 飲食店らしい魅力的な表現を使うこと
- 適切なハッシュタグを2〜5個含めること
${platform === 'x' ? '- 短く簡潔に、インパクトのある表現で' : ''}
${platform === 'instagram' ? '- 写真映えする描写を含め、ストーリー性のある文章で' : ''}
${platform === 'line' ? '- お客様への語りかけ口調で、クーポンや限定情報を意識して' : ''}`

    const existingContext = existing_posts
      ? `\n\n過去の投稿例（参考）:\n${existing_posts.slice(0, 3).join('\n---\n')}`
      : ''

    const userPrompt = `以下の条件で${platformLabel}の投稿を3パターン（フォーマル、カジュアル、フレンドリー）生成してください。
${topic ? `トピック: ${topic}` : 'トピック: 自由（季節やメニューに関連した内容）'}${existingContext}

JSON形式で出力してください:
[
  {"tone": "formal", "text": "投稿文"},
  {"tone": "casual", "text": "投稿文"},
  {"tone": "friendly", "text": "投稿文"}
]`

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
      console.error('Claude API error:', await claudeRes.text())
      await logAiInteraction(sbAdmin, {
        store_id,
        brand_id: ctx.brandId,
        interaction_type: 'sns_post',
        input_data: { platform, topic },
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

    let variants
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      variants = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    } catch {
      variants = [{ tone: 'formal', text: content }]
    }

    await logAiInteraction(sbAdmin, {
      store_id,
      brand_id: ctx.brandId,
      interaction_type: 'sns_post',
      input_data: { platform, topic },
      output_data: { variants },
      tokens_used: tokensUsed,
      model: 'claude-sonnet-4-20250514',
    })

    return new Response(
      JSON.stringify({
        success: true,
        variants,
        platform,
        char_limit: charLimit,
        quota: { remaining: quota.remaining !== undefined ? quota.remaining - 1 : -1, plan: quota.plan },
      }),
      { headers: jsonHeaders }
    )
  } catch (err) {
    console.error('generate-sns-post error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
