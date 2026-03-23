-- P0 Security Fix: SEC-4, SEC-5, SEC-6
-- Fix overly permissive RLS policies on orders, payments, refunds

-- ============================================================
-- SEC-4: orders — remove blanket authenticated SELECT
-- ============================================================
-- Drop the problematic policy that exposes all orders to all authenticated users
DROP POLICY IF EXISTS "orders_select_authenticated" ON orders;

-- orders_select_own (already exists) handles: member sees own orders
-- orders_by_brand (already exists) handles: staff sees brand orders
-- orders_service_role_all (already exists) handles: server-side full access
-- orders_deny_anon_select (already exists) handles: anon gets nothing
-- orders_anon_insert (already exists) handles: guest order creation

-- ============================================================
-- SEC-5: payments — replace blanket ALL with proper policies
-- ============================================================
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "auth_payments" ON payments;

-- Service role: full access (for API/Edge Functions)
CREATE POLICY "payments_service_role_all" ON payments
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Members: can view payments for their own orders only
CREATE POLICY "payments_select_own" ON payments
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE member_id IN (
        SELECT id FROM members WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Store staff: can view payments for their brand's orders
CREATE POLICY "payments_select_by_brand" ON payments
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE brand_id IN (
        SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- SEC-6: refunds — replace blanket ALL with proper policies
-- ============================================================
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "auth_refunds" ON refunds;

-- Service role: full access
CREATE POLICY "refunds_service_role_all" ON refunds
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Members: can view refunds for their own orders only
CREATE POLICY "refunds_select_own" ON refunds
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE member_id IN (
        SELECT id FROM members WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Store staff: can view refunds for their brand's orders
CREATE POLICY "refunds_select_by_brand" ON refunds
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE brand_id IN (
        SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );
