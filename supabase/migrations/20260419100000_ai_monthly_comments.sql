-- =============================================================================
-- ai_monthly_comments テーブル新設
--
-- 目的:
--   顧客管理画面の月次 AI コメント（merchant 向けダッシュボード）の
--   キャッシュ層として機能。generate-monthly-comment EF が生成と同時に
--   このテーブルへ INSERT し、フロントは DB SELECT で高速表示する。
--
-- 設計:
--   - venue_id: 生成対象店舗（NOT NULL、EF が venue 単位で動作）
--   - brand_id: denormalized（NOT NULL、フロント側のブランド単位検索を高速化）
--   - UNIQUE(venue_id, year, month): 月次 1 レコードを保証
--
-- 参考:
--   - cc-requests/CC_AI-A_report_20260419.md 発見 3
--   - cc-requests/CC_AI-B_report_20260419.md タスク 2
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_monthly_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month           INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  comment_text    TEXT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model           VARCHAR(100),
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  UNIQUE (venue_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_ai_monthly_comments_brand_year_month
  ON ai_monthly_comments (brand_id, year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_ai_monthly_comments_venue_year_month
  ON ai_monthly_comments (venue_id, year DESC, month DESC);

-- RLS
ALTER TABLE ai_monthly_comments ENABLE ROW LEVEL SECURITY;

-- authenticated: merchant が自ブランドのコメントを閲覧
CREATE POLICY "merchants can view own brand ai_monthly_comments"
  ON ai_monthly_comments FOR SELECT TO authenticated
  USING (
    brand_id IN (
      SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- service_role: EF からの INSERT/UPDATE/DELETE 用
CREATE POLICY "service_role full access ai_monthly_comments"
  ON ai_monthly_comments FOR ALL TO service_role
  USING (true) WITH CHECK (true);
