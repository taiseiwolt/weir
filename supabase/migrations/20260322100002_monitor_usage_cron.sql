-- ============================================================
-- pg_cron: 毎時0分に monitor-usage Edge Function を呼び出す
-- 1時間おきのサイレント監視
-- ============================================================

SELECT cron.schedule(
  'monitor-usage-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iikwusprydaogzeslgdz.supabase.co/functions/v1/monitor-usage',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
