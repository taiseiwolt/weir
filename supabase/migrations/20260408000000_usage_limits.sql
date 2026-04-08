-- usage_limits: 1 record = 1 brand x 1 action_type per period
CREATE TABLE IF NOT EXISTS usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()),
  used_count INTEGER DEFAULT 0,
  max_count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand_id, action_type, period_start)
);

-- usage_logs: 1 record = 1 usage event
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: usage_limits
ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_limits" ON usage_limits TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_own_limits" ON usage_limits FOR SELECT TO authenticated
  USING (brand_id IN (SELECT brand_id FROM stores WHERE id IN (SELECT store_id FROM store_staff WHERE user_id = auth.uid())));
CREATE POLICY "authenticated_insert_own_limits" ON usage_limits FOR INSERT TO authenticated
  WITH CHECK (brand_id IN (SELECT brand_id FROM stores WHERE id IN (SELECT store_id FROM store_staff WHERE user_id = auth.uid())));
CREATE POLICY "authenticated_update_own_limits" ON usage_limits FOR UPDATE TO authenticated
  USING (brand_id IN (SELECT brand_id FROM stores WHERE id IN (SELECT store_id FROM store_staff WHERE user_id = auth.uid())))
  WITH CHECK (brand_id IN (SELECT brand_id FROM stores WHERE id IN (SELECT store_id FROM store_staff WHERE user_id = auth.uid())));

-- RLS: usage_logs
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_logs" ON usage_logs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_select_own_logs" ON usage_logs FOR SELECT TO authenticated
  USING (brand_id IN (SELECT brand_id FROM stores WHERE id IN (SELECT store_id FROM store_staff WHERE user_id = auth.uid())));
CREATE POLICY "authenticated_insert_own_logs" ON usage_logs FOR INSERT TO authenticated
  WITH CHECK (brand_id IN (SELECT brand_id FROM stores WHERE id IN (SELECT store_id FROM store_staff WHERE user_id = auth.uid())));

-- Default limits for STD plan (P-04)
-- These should be inserted when a brand is created. Example:
-- INSERT INTO usage_limits (brand_id, action_type, max_count) VALUES
--   (brand_uuid, 'review_reply', 10),
--   (brand_uuid, 'sns_post', 10),
--   (brand_uuid, 'pop_image', 1),
--   (brand_uuid, 'monthly_ai_comment', 1);

-- pg_cron monthly reset (SQL only, manual setup required)
-- SELECT cron.schedule('reset-usage-limits', '0 0 1 * *',
--   $$UPDATE usage_limits SET used_count = 0, period_start = date_trunc('month', now()), updated_at = now() WHERE period_start < date_trunc('month', now())$$
-- );
