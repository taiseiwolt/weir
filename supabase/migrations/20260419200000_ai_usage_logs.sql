-- =============================================================================
-- ai_usage_logs テーブル新設
--
-- 目的:
--   全 AI EF（Claude / OpenAI / Google Places 等）の利用ログを集約。
--   D-83 違反（管理マスタ AI コスト管理の Demo Fallback）を解消し、
--   実データ駆動のコスト集計を可能にする。
--
-- 設計:
--   - venue_id: 利用元店舗（バックエンドバッチ等で NULL 可）
--   - merchant_id: 課金主体（venue/brand から解決、解決失敗時 NULL 可）
--   - feature: EF 種別（review_reply / sns_post / pop_image / monthly_comment /
--              competitor_compare / analyze_store_performance / collect_competitor_data
--              / google_places_collect / google_reviews_collect 等）
--   - cost_usd: USD 単位の計算済みコスト（small DECIMAL, 6 桁精度）
--   - status: success / error / rate_limited
--   - metadata: 各 EF 固有の追加情報（リクエストパラメータ、レスポンス要約等）
--
-- 参考:
--   - cc-requests/CC_AI-A_report_20260419.md 発見 3
--   - cc-requests/CC_AI-B_report_20260419.md タスク 4
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID REFERENCES venues(id) ON DELETE CASCADE,
  merchant_id     UUID REFERENCES merchants(id) ON DELETE CASCADE,
  feature         VARCHAR(50) NOT NULL,
  model           VARCHAR(100),
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost_usd        DECIMAL(10, 6),
  status          VARCHAR(20) NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success', 'error', 'rate_limited')),
  error_message   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_venue_created
  ON ai_usage_logs (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_merchant_created
  ON ai_usage_logs (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created
  ON ai_usage_logs (feature, created_at DESC);

-- RLS
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- authenticated: merchant が自社のログを閲覧
CREATE POLICY "merchants can view own ai_usage_logs"
  ON ai_usage_logs FOR SELECT TO authenticated
  USING (
    merchant_id IN (
      SELECT merchant_id FROM staff_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- service_role: EF からの INSERT/UPDATE/DELETE 用
CREATE POLICY "service_role full access ai_usage_logs"
  ON ai_usage_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
