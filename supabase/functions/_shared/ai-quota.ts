// AI機能 共通ユーティリティ
// STD無料枠チェック + ai_interactions記録

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STD_LIMITS: Record<string, number> = {
  review_reply: 10,
  sns_post: 10,
  pop_image: 1,
  monthly_comment: 1,
}

/** display_id (STR-xxx) と UUID の両方で店舗を引けるヘルパー */
async function resolveStoreId(sbAdmin: SupabaseClient, storeId: string): Promise<string | null> {
  const col = storeId.startsWith('STR-') ? 'display_id' : 'id'
  const { data } = await sbAdmin
    .from('stores')
    .select('id')
    .eq(col, storeId)
    .single()
  return data?.id || null
}

export interface QuotaResult {
  allowed: boolean
  plan: string
  remaining: number
  limit?: number
  used?: number
  message?: string
}

/**
 * STD無料枠チェック。PRO/EXPERTは上限なし。
 */
export async function checkAiQuota(
  sbAdmin: SupabaseClient,
  storeId: string,
  interactionType: string
): Promise<QuotaResult> {
  // display_id / UUID 両対応で store UUID を解決
  const resolvedId = await resolveStoreId(sbAdmin, storeId)
  if (!resolvedId) {
    return { allowed: false, plan: 'UNKNOWN', remaining: 0, message: '店舗が見つかりません' }
  }

  // store → brand 取得
  const { data: store } = await sbAdmin
    .from('stores')
    .select('brand_id')
    .eq('id', resolvedId)
    .single()

  if (!store) {
    return { allowed: false, plan: 'UNKNOWN', remaining: 0, message: '店舗が見つかりません' }
  }

  // プラン判定
  const { data: svcs } = await sbAdmin
    .from('service_subscriptions')
    .select('service_key')
    .eq('entity_type', 'brand')
    .eq('entity_id', store.brand_id)
    .eq('is_active', true)

  const svcKeys = (svcs || []).map((s: { service_key: string }) => s.service_key)
  let plan = 'STANDARD'
  if (svcKeys.includes('ai_expert')) plan = 'EXPERT'
  else if (svcKeys.includes('ai_pro')) plan = 'PRO'

  // PRO/EXPERT → 上限なし
  if (plan !== 'STANDARD') {
    return { allowed: true, plan, remaining: -1 }
  }

  // STD無料枠チェック
  const limit = STD_LIMITS[interactionType] || 0
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { count } = await sbAdmin
    .from('ai_interactions')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', resolvedId)
    .eq('interaction_type', interactionType)
    .eq('status', 'completed')
    .gte('created_at', monthStart.toISOString())

  const used = count || 0

  if (used >= limit) {
    return {
      allowed: false,
      plan,
      remaining: 0,
      limit,
      used,
      message: '無料枠の上限に達しました。PROプランにアップグレードすると無制限で利用できます。',
    }
  }

  return { allowed: true, plan, remaining: limit - used, limit, used }
}

/**
 * ai_interactionsに利用ログを記録
 */
export async function logAiInteraction(
  sbAdmin: SupabaseClient,
  params: {
    store_id: string
    brand_id?: string
    interaction_type: string
    input_data?: Record<string, unknown>
    output_data?: Record<string, unknown>
    tokens_used?: number
    model?: string
    status?: string
  }
) {
  // display_id が渡された場合は UUID に解決
  const storeUuid = await resolveStoreId(sbAdmin, params.store_id)
  const { error } = await sbAdmin.from('ai_interactions').insert({
    store_id: storeUuid || params.store_id,
    brand_id: params.brand_id || null,
    interaction_type: params.interaction_type,
    input_data: params.input_data || {},
    output_data: params.output_data || {},
    tokens_used: params.tokens_used || 0,
    model: params.model || null,
    status: params.status || 'completed',
  })

  if (error) console.error('Failed to log AI interaction:', error)
}

/**
 * 店舗情報を取得（AI機能で共通利用）
 */
export async function getStoreContext(sbAdmin: SupabaseClient, storeId: string) {
  // display_id / UUID 両対応
  const resolvedId = await resolveStoreId(sbAdmin, storeId)
  if (!resolvedId) return null

  const { data: store } = await sbAdmin
    .from('stores')
    .select('id, name, brand_id, genre, google_place_id, brands(id, name)')
    .eq('id', resolvedId)
    .single()

  if (!store) return null

  // 商品カテゴリ情報も取得
  const { data: products } = await sbAdmin
    .from('products')
    .select('name, category')
    .eq('store_id', resolvedId)
    .eq('is_available', true)
    .limit(10)

  return {
    storeName: store.name,
    brandName: (store as any).brands?.name || '',
    description: (store as any).genre || '',
    brandId: store.brand_id,
    products: (products || []).map((p: any) => p.name),
  }
}
