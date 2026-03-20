-- ============================================================
-- 既存の pending 注文を掃除する（1回限りの実行）
-- create-payment-intent が過去に作った pending 注文を削除
-- ============================================================
-- 実行前に件数を確認:
-- SELECT count(*) FROM orders WHERE payment_status = 'pending';

-- order_items を先に削除（外部キー制約）
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE payment_status = 'pending'
);

-- pending 注文を削除
DELETE FROM orders WHERE payment_status = 'pending';

-- 確認
SELECT count(*) AS remaining_pending FROM orders WHERE payment_status = 'pending';
