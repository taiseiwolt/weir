-- =============================================
-- 競合データ収集 pg_cronジョブ
-- 毎週日曜 UTC 18:00 (= JST 月曜 3:00) に実行
-- google-reviews-collector と同じ時刻だが、別ジョブとして独立
-- =============================================

SELECT cron.schedule(
  'collect-competitor-data-weekly',
  '30 18 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://iikwusprydaogzeslgdz.supabase.co/functions/v1/collect-competitor-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
