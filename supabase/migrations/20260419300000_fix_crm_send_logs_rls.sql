-- =============================================================================
-- crm_send_logs RLS ポリシー修正
--
-- 問題:
--   20260406800000_crm_send_logs.sql:32 で `WHERE auth_uid = auth.uid()` と書かれているが、
--   staff_accounts の正しいカラム名は `auth_user_id`（他 migration で一貫）。
--   このため authenticated ユーザーが自ブランドの CRM 送信履歴を読めない（実質常に空配列）。
--
-- 修正方針:
--   既存ポリシーを DROP して、正しいカラム名 (auth_user_id) で再作成する。
--   既存 migration ファイルは履歴透明性のため変更しない。
--
-- 参考: cc-requests/CC_AI-A_report_20260419.md 発見 4
-- =============================================================================

DROP POLICY IF EXISTS "authenticated_read_own_brand" ON crm_send_logs;

CREATE POLICY "authenticated_read_own_brand" ON crm_send_logs
  FOR SELECT TO authenticated
  USING (
    brand_id IN (
      SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
    )
  );
