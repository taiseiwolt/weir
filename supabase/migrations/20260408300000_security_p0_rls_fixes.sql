-- =============================================================
-- セキュリティP0修正: RLSポリシー一括修正
-- チームCレビュー 2026-04-08 準拠
-- 対象: competitor 4テーブル, orders, store_policies, FAQs,
--        Google Reviews 5テーブル, audit_logs
-- =============================================================

-- ─────────────────────────────────────────────────
-- A-2: 競合分析4テーブル — service_roleのみ全操作可に修正
-- (02-P0-2) 現在: FOR ALL USING(true) ロール制限なし
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_all" ON competitor_collection_config;
DROP POLICY IF EXISTS "service_role_all" ON competitor_stores;
DROP POLICY IF EXISTS "service_role_all" ON competitor_reviews;
DROP POLICY IF EXISTS "service_role_all" ON competitor_metrics_weekly;

CREATE POLICY "service_role_only" ON competitor_collection_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON competitor_stores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON competitor_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON competitor_metrics_weekly
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────
-- A-3: ordersテーブル — 過剰なSELECTポリシーを削除
-- (02-P0-3) orders_authenticated_select_all を削除
-- orders_authenticated_select_by_store (自店舗スコープ) は残す
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "orders_authenticated_select_all" ON orders;

-- ─────────────────────────────────────────────────
-- A-4: store_policies — anon書込みポリシーを削除
-- (02-P0-4) anonはSELECTのみ許可
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "store_policies_insert_anon" ON store_policies;
DROP POLICY IF EXISTS "store_policies_update_anon" ON store_policies;
DROP POLICY IF EXISTS "store_policies_delete_anon" ON store_policies;

-- anon SELECT は残す（チャットボットがポリシー参照するため）
-- store_policies_select_anon は既存のまま

-- ─────────────────────────────────────────────────
-- A-5: FAQs — anon書込みポリシーを削除
-- (02-P0-5) anonはSELECTのみ許可
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "faqs_insert_anon" ON faqs;
DROP POLICY IF EXISTS "faqs_update_anon" ON faqs;
DROP POLICY IF EXISTS "faqs_delete_anon" ON faqs;

-- faqs_select_all は既存のまま（公開FAQ表示用）

-- ─────────────────────────────────────────────────
-- A-6: Google Reviews 5テーブル — FOR ALL USING(true) を修正
-- (02-P0-6) service_roleのみ全操作可に修正
-- staff_read_* ポリシーは残す（管理画面からの閲覧用）
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_all_google_places" ON google_places;
DROP POLICY IF EXISTS "service_role_all_google_reviews" ON google_reviews;
DROP POLICY IF EXISTS "service_role_all_competitor_mappings" ON competitor_mappings;
DROP POLICY IF EXISTS "service_role_all_collection_progress" ON collection_progress;
DROP POLICY IF EXISTS "service_role_all_review_alerts" ON review_alerts;

CREATE POLICY "service_role_only" ON google_places
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON google_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON competitor_mappings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON collection_progress
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_only" ON review_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────
-- D-1: audit_logs — DELETE/UPDATE制限
-- (05-P0-1) authenticatedはINSERT/SELECTのみ。DELETE/UPDATE不可
-- ─────────────────────────────────────────────────

-- 既存ポリシーを全削除して再作成
DO $$
BEGIN
  -- 既存ポリシーがあれば削除
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs') THEN
    EXECUTE (
      SELECT string_agg('DROP POLICY IF EXISTS "' || policyname || '" ON audit_logs;', ' ')
      FROM pg_policies WHERE tablename = 'audit_logs'
    );
  END IF;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- service_role: 全操作可
CREATE POLICY "audit_logs_service_role" ON audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated: INSERT のみ（ログ追記）
CREATE POLICY "audit_logs_authenticated_insert" ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- authenticated: SELECT のみ（ログ閲覧）
CREATE POLICY "audit_logs_authenticated_select" ON audit_logs
  FOR SELECT TO authenticated USING (true);

-- DELETE/UPDATE ポリシーは作成しない → authenticated は DELETE/UPDATE 不可

-- 追加防御: トリガーによる UPDATE/DELETE 禁止（service_role含む全ロール）
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only. UPDATE and DELETE are prohibited.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();
