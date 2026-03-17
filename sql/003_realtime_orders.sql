-- ============================================================
-- AIden Step 4: Supabase Realtime for Orders
-- 実行場所: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add orders table to Realtime publication
-- This enables Realtime INSERT/UPDATE/DELETE events
DO $$
BEGIN
  -- Check if orders is already in supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END
$$;

-- 2. RLS policies for anon access (dashboard + tracking)
-- Dashboard: store staff view orders by store_id (anon key, no auth)
DROP POLICY IF EXISTS "orders_anon_select_by_store" ON orders;
CREATE POLICY "orders_anon_select_by_store" ON orders
  FOR SELECT
  TO anon
  USING (true);

-- Note: For production, restrict to specific store_id:
-- USING (store_id IN (SELECT id FROM stores WHERE is_active = true))
-- For now, allow all SELECT for anon to support dashboard + tracking

-- 3. RLS policy for order_items anon access (needed for full order fetch)
DROP POLICY IF EXISTS "order_items_anon_select" ON order_items;
CREATE POLICY "order_items_anon_select" ON order_items
  FOR SELECT
  TO anon
  USING (true);

-- 4. Enable replica identity FULL for better Realtime payloads
-- This ensures UPDATE events include all columns, not just changed ones
ALTER TABLE orders REPLICA IDENTITY FULL;
