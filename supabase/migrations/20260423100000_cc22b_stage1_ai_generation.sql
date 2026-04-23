-- =============================================================================
-- CC-22b-stage1: AI 生成ジョブ基盤（MVP）
--
-- 目的:
--   Weir オンボーディングの Step 4 で加盟店にレビュー返信プレビューを
--   実データで見せるための非同期ジョブ基盤。D-217 汎用ジョブ + 結果テーブル方式。
--
-- 設計上の重要決定（plan からの逸脱点）:
--   plan は venue_id を必須としていたが、CC-22a 時点のオンボは匿名 UI skeleton で
--   venue レコードは作成されない。Stage 1 MVP では以下で対応:
--     - venue_id / brand_id: NULLABLE（将来 Stage 2+ で venue 作成時に UPDATE）
--     - session_id: オンボ localStorage の state.session.id を使用
--     - brand_snapshot: jsonb で { brand_name, concept, cuisine_label } を捕獲
--     - cuisine_key / tone: ジョブ自身に格納（venues を引かない）
--
-- RLS 方針:
--   - authenticated: staff_accounts → brand_id 経由（ai_monthly_comments と同じ）
--   - anon: SELECT のみ許可（オンボ中 Realtime subscribe 用）。job_id は UUID で
--     事実上推測不能、かつ格納データは業態別テンプレレビュー + AI 返信のみ（PII なし）
--   - service_role: 全権限（EF 専用）
--
-- Related Decisions:
--   D-216 (Stage 1 = オンボプレビューのみ)
--   D-217 (汎用ジョブ + 結果テーブル方式)
--   D-218 (モデル選定)
--   D-219 (エラーハンドリング = リトライ + 明示エラー)
--   D-222 (CC-22b-stage1 MVP 範囲)
--
-- 手動実行 (TL-02): Taisei が staging → production の順で SQL 実行
-- =============================================================================

-- ============================================================
-- 1. generation_jobs: 汎用ジョブ管理テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS generation_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          uuid REFERENCES venues(id) ON DELETE CASCADE,
  brand_id          uuid REFERENCES brands(id) ON DELETE CASCADE,
  session_id        text,
  job_type          text NOT NULL
                      CHECK (job_type IN ('review_reply')),
  cuisine_key       text NOT NULL
                      CHECK (cuisine_key ~ '^(warmth|modern|premium|casual)-[1-4]$'),
  tone              text NOT NULL
                      CHECK (tone IN ('warmth', 'modern', 'premium', 'casual')),
  brand_snapshot    jsonb,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at        timestamptz,
  completed_at      timestamptz,
  error_code        text,
  error_message     text,
  retry_count       int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (venue_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_venue_status
  ON generation_jobs (venue_id, status);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_created
  ON generation_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_session
  ON generation_jobs (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants_read_own_generation_jobs"
  ON generation_jobs FOR SELECT TO authenticated
  USING (
    brand_id IN (
      SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "anon_read_generation_jobs"
  ON generation_jobs FOR SELECT TO anon
  USING (true);

CREATE POLICY "service_role_all_generation_jobs"
  ON generation_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE generation_jobs IS
  'CC-22b-stage1: 汎用 AI 生成ジョブ。Stage 1 は review_reply のみ。Stage 2+ で pop/sns/report/site を追加。';
COMMENT ON COLUMN generation_jobs.session_id IS
  'オンボ中の匿名セッション識別子（localStorage weir_onboarding_state_v1 の session.id）。Stage 2+ で venue 作成時に venue_id に移行。';
COMMENT ON COLUMN generation_jobs.brand_snapshot IS
  'ジョブ作成時点の店舗情報スナップショット: { brand_name, concept, cuisine_label }。Worker が Claude API の system prompt に注入。';

-- ============================================================
-- 2. generation_results: 生成物テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS generation_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  result_type   text NOT NULL
                  CHECK (result_type IN ('review_reply')),
  content       jsonb NOT NULL,
  tone          text CHECK (tone IN ('warmth', 'modern', 'premium', 'casual')),
  variation     text,
  seq           int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_results_job
  ON generation_results (job_id, seq);

ALTER TABLE generation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants_read_own_generation_results"
  ON generation_results FOR SELECT TO authenticated
  USING (
    job_id IN (
      SELECT id FROM generation_jobs
      WHERE brand_id IN (
        SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "anon_read_generation_results"
  ON generation_results FOR SELECT TO anon
  USING (true);

CREATE POLICY "service_role_all_generation_results"
  ON generation_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE generation_results IS
  'CC-22b-stage1: ジョブ生成物。1 ジョブあたり複数行（Stage 1 は 3 レビュー返信）。content jsonb は機能別構造。';
COMMENT ON COLUMN generation_results.content IS
  'review_reply 時: { reply_text, source_review, tone_used, model, generated_at, prompt_tokens, completion_tokens }';

-- ============================================================
-- 3. template_reviews: 業態別テンプレレビュー（48 件 seed、別ファイル）
-- ============================================================

CREATE TABLE IF NOT EXISTS template_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuisine_key   text NOT NULL
                  CHECK (cuisine_key ~ '^(warmth|modern|premium|casual)-[1-4]$'),
  review_text   text NOT NULL,
  seq           int NOT NULL CHECK (seq IN (1, 2, 3)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuisine_key, seq)
);

CREATE INDEX IF NOT EXISTS idx_template_reviews_cuisine
  ON template_reviews (cuisine_key);

ALTER TABLE template_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_template_reviews"
  ON template_reviews FOR SELECT
  USING (true);

CREATE POLICY "service_role_all_template_reviews"
  ON template_reviews FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE template_reviews IS
  'CC-22b-stage1: 16 業態 × 3 件 = 48 件のフィクションレビュー文。Stage 1 オンボプレビュー用。実顧客データではない。';

-- ============================================================
-- 4. rate_limits: API Rate Limit 追跡（venue / IP 単位）
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_type      text NOT NULL
                  CHECK (key_type IN ('venue', 'ip', 'session')),
  key_value     text NOT NULL,
  called_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits (key_type, key_value, called_at DESC);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_rate_limits"
  ON rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE rate_limits IS
  'CC-22b-stage1: API Rate Limit 追跡。venue_id / session_id / IP 単位で呼び出し履歴を記録。1 時間より古いレコードは Stage 2 で pg_cron 自動削除予定。';
