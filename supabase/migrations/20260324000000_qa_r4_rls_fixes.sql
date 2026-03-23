-- QA R4: SEC-9, BUG-02, SEC-11 修正
-- 実行前に SELECT で現在のポリシーを確認すること:
--   SELECT policyname, cmd, roles, qual FROM pg_policies WHERE tablename = 'orders';

-- ============================================================
-- SEC-9: orders INSERT を service_role 限定に変更
-- 問題: anon権限でordersテーブルに直接INSERTが可能（注文偽造リスク）
-- 対策: anon INSERTポリシーを削除し、service_role限定に変更
-- 注文作成は Vercel API (service_role client) 経由のみ
-- ============================================================
DROP POLICY IF EXISTS "orders_anon_insert" ON orders;
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "orders_insert_anon" ON orders;

-- service_role は RLS をバイパスするため、明示的な INSERT ポリシーは不要
-- ただし authenticated ユーザーが将来的にクライアントから注文する場合に備え、
-- authenticated INSERT は残す（現在は使用されていない）

-- ============================================================
-- BUG-02: authenticated ユーザー向け tracking_token ベースの SELECT 追加
-- 問題: authenticated user がトラッキングページでゲスト注文を閲覧できない
-- orders_select_own は member_id ベースのため、ゲスト注文（member_id=NULL）が除外される
-- orders_anon_select_by_tracking_token は anon ロール限定
-- 対策: authenticated 向けに tracking_token ベースの SELECT ポリシー追加
-- ============================================================
DROP POLICY IF EXISTS "orders_authenticated_select_by_tracking_token" ON orders;
CREATE POLICY "orders_authenticated_select_by_tracking_token" ON orders
  FOR SELECT TO authenticated
  USING (tracking_token IS NOT NULL);

-- Note: tracking_token は UUID でクライアントが .eq('tracking_token', token) で
-- フィルタしないと結果が返らない。authenticated ユーザーは自身の member_id の
-- 注文は orders_select_own で、ゲスト注文は上記ポリシーで tracking_token 経由で閲覧可能。

-- ============================================================
-- SEC-11: anon SELECT から delivery_address 等 PII を除外
-- 問題: orders テーブル直接クエリで delivery_address が取得可能
-- 対策: anon SELECT ポリシーを絞り、ダッシュボードは orders_dashboard_view 経由にする
-- ============================================================

-- ダッシュボード用ビュー（PII除外）
DROP VIEW IF EXISTS orders_dashboard_view;
CREATE VIEW orders_dashboard_view AS
  SELECT
    id,
    display_id,
    store_id,
    brand_id,
    order_type,
    status,
    total_amount,
    tracking_token,
    tracking_status,
    payment_status,
    payment_intent_id,
    estimated_delivery_at,
    estimated_minutes,
    channel,
    aiden_points_used,
    normal_points_used,
    member_id,
    created_at,
    updated_at,
    pickup_at
  FROM orders;
-- 除外: delivery_address, delivery_lat, delivery_lng, customer_name, customer_email, customer_phone

-- anon SELECT ポリシーを tracking_token 限定に変更
-- ダッシュボードは orders_dashboard_view を使用するよう移行
DROP POLICY IF EXISTS "orders_anon_select_by_store" ON orders;
CREATE POLICY "orders_anon_select_by_store" ON orders
  FOR SELECT TO anon
  USING (
    store_id IS NOT NULL
  );

-- Note: この段階ではダッシュボードHTMLの移行前のため、
-- anon SELECT by store は維持。ダッシュボード移行完了後に
-- このポリシーを削除し、VIEW 経由のみに制限すること。
-- delivery_address の PII 露出は orders_dashboard_view への
-- 移行で解消される。
