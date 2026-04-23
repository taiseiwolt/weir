// CC-22b-stage1: Review reply prompt construction.
// Kept as TS module (not YAML) for Stage 1 MVP. Stage 2+: extract to prompts/review-reply.yaml
// per weir-ai-integration skill convention and add horizontal/vertical learning injection.

export const MODEL_NAME = 'claude-sonnet-4-6'

export interface BrandSnapshot {
  brand_name?: string
  concept?: string
  cuisine_label?: string
}

const TONE_DESCRIPTIONS: Record<string, string> = {
  warmth: '親しみやすく、常連客への感謝を込めた口調',
  modern: '洗練された知的な口調、簡潔',
  premium: '格式を保ちつつ温度感のある言葉遣い',
  casual: '気さくで親近感のある口調',
}

export function buildReviewReplyPrompt(
  brand: BrandSnapshot,
  tone: string,
  reviewText: string,
): { systemPrompt: string; userPrompt: string } {
  const brandName = brand.brand_name || 'お店'
  const cuisine = brand.cuisine_label || ''
  const concept = brand.concept || ''
  const toneDesc = TONE_DESCRIPTIONS[tone] || '自然な敬語'

  const systemPrompt = `あなたは Weir の AI パートナーです。日本の飲食店「${brandName}」の加盟店に代わって、Google マイビジネス等のレビュー返信を丁寧な日本語で作成します。

【加盟店情報】
- 店名: ${brandName}
- 業態: ${cuisine || '（未設定）'}
- コンセプト: ${concept || '（未入力）'}

【返信の方針】
- トーン: ${toneDesc}
- 自然な敬語、堅すぎず柔らかすぎず
- 100〜150 文字程度
- 絵文字・顔文字は使わない
- 「お客様」への呼びかけを含める
- 加盟店の個性が伝わる言い回し
- 店舗名や署名を本文に含めない
- 顧客の個人情報は書かない

返信のみを出力してください。挨拶や前置きは不要です。`

  const userPrompt = `以下のお客様のレビューに返信してください:
「${reviewText}」`

  return { systemPrompt, userPrompt }
}
