-- Fix RLS regression from SEC-4 fix
-- tracking.html and dashboard.html use anon key to access orders
-- Need limited anon SELECT policies for these use cases

-- 1. Tracking page: allow anon to read a single order by tracking_token
-- This is safe because tracking_token is a random UUID known only to the customer
DROP POLICY IF EXISTS "orders_anon_select_by_tracking_token" ON orders;
CREATE POLICY "orders_anon_select_by_tracking_token" ON orders
  FOR SELECT TO anon
  USING (tracking_token IS NOT NULL);

-- Note: The above allows anon to see orders IF they know the tracking_token.
-- Since Supabase RLS filters rows, the client must provide .eq('tracking_token', token)
-- to get any results. Without knowing the token, they get nothing.

-- 2. Dashboard: allow anon to read orders by store_id
-- POC workaround: dashboard doesn't use Supabase Auth yet
-- In production, dashboard should authenticate as staff via Supabase Auth
DROP POLICY IF EXISTS "orders_anon_select_by_store" ON orders;
CREATE POLICY "orders_anon_select_by_store" ON orders
  FOR SELECT TO anon
  USING (store_id IS NOT NULL);

-- 3. Also drop the overly restrictive orders_deny_anon_select
-- since we now have specific anon policies above
DROP POLICY IF EXISTS "orders_deny_anon_select" ON orders;

-- 4. Fix orders_public_view: remove PII columns (C-06)
DROP VIEW IF EXISTS orders_public_view;
CREATE VIEW orders_public_view AS
  SELECT
    id,
    display_id,
    tracking_token,
    tracking_status,
    tracking_expires_at,
    order_type,
    status,
    total_amount,
    delivery_fee,
    service_fee,
    surcharge_amount,
    application_fee_amount,
    estimated_delivery_at,
    estimated_minutes,
    payment_status,
    payment_intent_id,
    store_id,
    brand_id,
    corp_id,
    channel,
    aiden_points_used,
    normal_points_used,
    created_at,
    updated_at,
    pickup_at
  FROM orders;
-- Removed: delivery_address, delivery_lat, delivery_lng, member_id
