-- =============================================================
-- 予約INSERT時 FCMプッシュ通知トリガー
-- reservations に新規INSERT → send-push-notification EF を呼び出す
-- =============================================================

-- pg_net 拡張の有効化（既存でも冪等）
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- -----------------------------------------------------------
-- 1. trigger関数: notify_new_reservation
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_new_reservation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://iikwusprydaogzeslgdz.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3d1c3ByeWRhb2d6ZXNsZ2R6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjk0Mjk0NSwiZXhwIjoyMDUyNTE4OTQ1fQ.y98wCPvy-t6rCtx1s-b-B7MJwd1P7hBf4XT-6LEJHSQ'
    ),
    body := jsonb_build_object(
      'store_id', NEW.store_id,
      'title', '新規予約',
      'body', COALESCE(NEW.name, '顧客') || '様 '
              || to_char(NEW.date, 'YYYY/MM/DD') || ' '
              || to_char(NEW.time, 'HH24:MI') || ' '
              || NEW.guest_count || '名',
      'data', jsonb_build_object(
        'type', 'reservation',
        'reservation_id', NEW.id
      )
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------
-- 2. trigger: trg_notify_new_reservation
-- -----------------------------------------------------------
CREATE TRIGGER trg_notify_new_reservation
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_reservation();
