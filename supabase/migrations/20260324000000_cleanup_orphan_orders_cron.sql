-- ============================================================
-- 孤児注文（orphan orders）自動クリーンアップ
-- 決済失敗で payment_status='pending' のまま残った注文を定期削除
-- ============================================================

-- 1時間以上 pending のまま放置された注文をキャンセルする関数
CREATE OR REPLACE FUNCTION cleanup_orphan_pending_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cancelled_count integer;
BEGIN
  -- order_items を先に削除（外部キー制約）
  DELETE FROM order_items WHERE order_id IN (
    SELECT id FROM orders
    WHERE payment_status = 'pending'
      AND created_at < now() - interval '1 hour'
  );

  -- pending 注文をキャンセル（failed + cancelled に更新）
  WITH updated AS (
    UPDATE orders
    SET payment_status = 'failed',
        status = 'cancelled',
        updated_at = now()
    WHERE payment_status = 'pending'
      AND created_at < now() - interval '1 hour'
    RETURNING id
  )
  SELECT count(*) INTO cancelled_count FROM updated;

  IF cancelled_count > 0 THEN
    RAISE LOG 'cleanup_orphan_pending_orders: cancelled % orphan orders', cancelled_count;
  END IF;
END;
$$;

-- pg_cron: 毎時実行（UTC）
SELECT cron.schedule(
  'cleanup-orphan-pending-orders',
  '0 * * * *',
  'SELECT cleanup_orphan_pending_orders()'
);
