-- ============================================================
-- pg_cron: 毎月1日 0:00 JST に月次請求書を自動生成
-- ============================================================

-- pg_cron 拡張が有効な場合のみ実行
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 既存ジョブがあれば削除
    PERFORM cron.unschedule('generate-monthly-invoice');
  EXCEPTION WHEN OTHERS THEN
    -- ジョブが存在しない場合は無視
    NULL;
  END IF;
END $$;

-- pg_net + pg_cron で Edge Function を呼び出す
-- 毎月1日 0:00 JST = 前日 15:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'generate-monthly-invoice',
      '0 15 28-31 * *',  -- 月末近くの15:00 UTC (翌月1日 0:00 JST)
      $$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-monthly-invoice',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
      );
      $$
    );
  END IF;
END $$;
