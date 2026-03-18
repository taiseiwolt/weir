-- =============================================
-- pg_cron ジョブ: Google口コミ収集スケジュール
-- =============================================

-- pg_net 拡張の有効化（HTTP呼び出し用）
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- 1. google-reviews-collector: 毎週月曜 3:00 AM JST (= 日曜 18:00 UTC)
SELECT cron.schedule(
  'google-reviews-collector-weekly',
  '0 18 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://iikwusprydaogzeslgdz.supabase.co/functions/v1/google-reviews-collector',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. google-places-background-collector: 毎日 4:00 AM JST (= 19:00 UTC 前日)
SELECT cron.schedule(
  'google-places-bg-collector-daily',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://iikwusprydaogzeslgdz.supabase.co/functions/v1/google-places-background-collector',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
