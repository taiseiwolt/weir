// Edge Function: POP画像生成
// OpenAI DALL-E 3 API で画像生成 → Supabase Storageにアップロード

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  corsPreflightResponse,
  requireAuthOrServiceRole,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'
import { checkAiQuota, logAiInteraction, getStoreContext } from '../_shared/ai-quota.ts'
import { logAiUsage } from '../_shared/ai-usage-log.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

const STYLE_PROMPTS: Record<string, string> = {
  modern: 'Modern, clean, minimalist design with bold typography. Professional restaurant POP poster.',
  traditional: 'Traditional Japanese style (和風), warm colors, brush stroke elements. Authentic restaurant POP poster.',
  cute: 'Cute, kawaii style with pastel colors, rounded shapes, and playful elements. Fun restaurant POP poster.',
}

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
    const { prompt_text, style } = body

    if (!store_id || !prompt_text) {
      return new Response(
        JSON.stringify({ error: 'venue_id, prompt_text は必須です' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const selectedStyle = style && STYLE_PROMPTS[style] ? style : 'modern'
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const quota = await checkAiQuota(sbAdmin, store_id, 'pop_image')
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

    // DALL-E 3 プロンプト構築
    const dallePrompt = `${STYLE_PROMPTS[selectedStyle]}
Restaurant name: ${ctx.storeName}
Content: ${prompt_text}
Requirements:
- Food/restaurant themed promotional image
- Text should be in Japanese
- High quality, appetizing visual
- Suitable for in-store display or social media
- No photorealistic human faces`

    // DALL-E 3 API 呼び出し
    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
    })

    if (!dalleRes.ok) {
      const errText = await dalleRes.text()
      console.error('DALL-E API error:', errText)
      await logAiInteraction(sbAdmin, {
        store_id,
        brand_id: ctx.brandId,
        interaction_type: 'pop_image',
        input_data: { prompt_text, style: selectedStyle },
        status: 'failed',
        model: 'dall-e-3',
      })
      const { data: vRowErr } = await sbAdmin
        .from('venues')
        .select('id')
        .eq(store_id.startsWith('STR-') ? 'display_id' : 'id', store_id)
        .maybeSingle()
      await logAiUsage(sbAdmin, {
        venue_id: vRowErr?.id || null,
        brand_id: ctx.brandId,
        feature: 'pop_image',
        model: 'dall-e-3',
        status: 'error',
        error_message: errText,
        metadata: { style: selectedStyle },
      })
      return new Response(JSON.stringify({ error: 'POP画像の生成に失敗しました' }), {
        status: 502,
        headers: jsonHeaders,
      })
    }

    const dalleData = await dalleRes.json()
    const b64Image = dalleData.data?.[0]?.b64_json
    const revisedPrompt = dalleData.data?.[0]?.revised_prompt || ''

    if (!b64Image) {
      return new Response(JSON.stringify({ error: '画像データが取得できませんでした' }), {
        status: 502,
        headers: jsonHeaders,
      })
    }

    // Base64 → Uint8Array
    const binaryStr = atob(b64Image)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    // Supabase Storage にアップロード
    const fileName = `pop/${store_id}/${Date.now()}.png`
    const { error: uploadError } = await sbAdmin.storage
      .from('images')
      .upload(fileName, bytes, {
        contentType: 'image/png',
        upsert: false,
        cacheControl: '31536000',
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return new Response(JSON.stringify({ error: '画像のアップロードに失敗しました' }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const { data: urlData } = sbAdmin.storage.from('images').getPublicUrl(fileName)
    const imageUrl = urlData?.publicUrl || ''

    // ai_interactionsに記録
    await logAiInteraction(sbAdmin, {
      store_id,
      brand_id: ctx.brandId,
      interaction_type: 'pop_image',
      input_data: { prompt_text, style: selectedStyle },
      output_data: { image_url: imageUrl, revised_prompt: revisedPrompt },
      model: 'dall-e-3',
    })

    // ai_usage_logs にも記録（DALL-E 3 standard 1024x1024 = $0.04/枚）
    const { data: vRow } = await sbAdmin
      .from('venues')
      .select('id')
      .eq(store_id.startsWith('STR-') ? 'display_id' : 'id', store_id)
      .maybeSingle()
    await logAiUsage(sbAdmin, {
      venue_id: vRow?.id || null,
      brand_id: ctx.brandId,
      feature: 'pop_image',
      model: 'dall-e-3',
      cost_usd: 0.04,
      status: 'success',
      metadata: { style: selectedStyle, image_url: imageUrl },
    })

    return new Response(
      JSON.stringify({
        success: true,
        image_url: imageUrl,
        prompt_used: revisedPrompt,
        quota: { remaining: quota.remaining !== undefined ? quota.remaining - 1 : -1, plan: quota.plan },
      }),
      { headers: jsonHeaders }
    )
  } catch (err) {
    console.error('generate-pop-image error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
