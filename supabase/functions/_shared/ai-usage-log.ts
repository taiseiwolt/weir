// ai_usage_logs テーブルへの記録ヘルパー
// 全 AI EF で共通利用。venue_id/brand_id から merchant_id を解決し、ベストエフォートで INSERT する。
//
// 設計方針:
//   - 失敗してもログだけにとどめ、呼出元 EF のレスポンスには影響を与えない
//   - venue_id は必須（NULL も許容するが、紐付けが取れた方がコスト集計に有用）
//   - merchant_id は brand_id 経由で自動解決（brands.merchant_id）

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AiUsageStatus = 'success' | 'error' | 'rate_limited'

export interface LogAiUsageParams {
  venue_id?: string | null
  brand_id?: string | null
  feature: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number
  status: AiUsageStatus
  error_message?: string
  metadata?: Record<string, unknown>
}

/**
 * ai_usage_logs に INSERT。失敗は console.error のみ、例外は呑む。
 *
 * @param sbAdmin service_role クライアント
 * @param params 記録するパラメータ
 */
export async function logAiUsage(
  sbAdmin: SupabaseClient,
  params: LogAiUsageParams,
): Promise<void> {
  try {
    let merchantId: string | null = null
    if (params.brand_id) {
      const { data: bRow } = await sbAdmin
        .from('brands')
        .select('merchant_id')
        .eq('id', params.brand_id)
        .maybeSingle()
      merchantId = bRow?.merchant_id || null
    }

    const { error } = await sbAdmin.from('ai_usage_logs').insert({
      venue_id: params.venue_id || null,
      merchant_id: merchantId,
      feature: params.feature,
      model: params.model || null,
      input_tokens: params.input_tokens ?? null,
      output_tokens: params.output_tokens ?? null,
      cost_usd: params.cost_usd ?? null,
      status: params.status,
      error_message: params.error_message?.slice(0, 500) || null,
      metadata: params.metadata || null,
    })

    if (error) {
      console.error('[logAiUsage] INSERT failed:', error)
    }
  } catch (err) {
    console.error('[logAiUsage] unexpected error:', err)
  }
}
