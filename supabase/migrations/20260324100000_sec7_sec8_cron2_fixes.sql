-- SEC-7: Enable RLS on store_hours and add policies
-- store_hours needs anon SELECT for mobile order menu display
ALTER TABLE store_hours ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read store hours (needed for mobile order / brand page)
CREATE POLICY store_hours_select_all ON store_hours
  FOR SELECT USING (true);

-- Only service_role can modify store hours (via admin API)
CREATE POLICY store_hours_service_role_all ON store_hours
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SEC-8: The 8 tables (db_metrics, edge_function_logs, alert_history,
-- plan_change_requests, invoice_adjustments, sns_posts, sns_connections,
-- monitoring_alerts) already have RLS enabled with no policies.
-- This is intentionally by design: only service_role can access them.
-- No changes needed — this is the correct pattern for internal/admin-only tables.
-- Adding explicit service_role policies for clarity:

CREATE POLICY db_metrics_service_role ON db_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY edge_function_logs_service_role ON edge_function_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY alert_history_service_role ON alert_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY plan_change_requests_service_role ON plan_change_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY invoice_adjustments_service_role ON invoice_adjustments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY sns_posts_service_role ON sns_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY sns_connections_service_role ON sns_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY monitoring_alerts_service_role ON monitoring_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CRON-2: Fix collect-competitor-data-weekly to use hardcoded service_role_key
-- instead of current_setting('app.settings.service_role_key') which is undefined
SELECT cron.unschedule('collect-competitor-data-weekly');

SELECT cron.schedule(
  'collect-competitor-data-weekly',
  '30 18 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://iikwusprydaogzeslgdz.supabase.co/functions/v1/collect-competitor-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3d1c3ByeWRhb2d6ZXNsZ2R6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU3NDU1NiwiZXhwIjoyMDg3MTUwNTU2fQ.ShAWlGjCfxNW10BkZOEQ13OwwJJyJScozFP8RB2Mj50',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
