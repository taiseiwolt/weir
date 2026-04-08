-- order_items: authenticatedロールにSELECTを許可
-- POSアプリ（店舗スタッフ）がorder_itemsを取得できるようにする
-- 条件: order_itemsの親orderが、ログインユーザーの所属店舗に紐付いていること

DROP POLICY IF EXISTS "order_items_authenticated_select" ON order_items;

CREATE POLICY "order_items_authenticated_select" ON order_items
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM orders o
      WHERE o.store_id IN (
        SELECT a.store_id FROM accounts a WHERE a.id = auth.uid()
      )
    )
  );

-- orders: authenticatedロールにSELECTを許可（POS用）
-- 既存の orders_select_own はmember_id経由のみ（エンドユーザー向け）
-- POS店舗スタッフ用に store_id 経由のSELECTを追加

DROP POLICY IF EXISTS "orders_authenticated_select_by_store" ON orders;

CREATE POLICY "orders_authenticated_select_by_store" ON orders
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT a.store_id FROM accounts a WHERE a.id = auth.uid()
    )
  );
