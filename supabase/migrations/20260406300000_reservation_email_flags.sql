-- 予約サンクスメール・リマインダーメール送信フラグ追加
-- 手動実行: Supabase Dashboard > SQL Editor

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS thanks_mail_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- インデックス: pg_cronバッチ検索用
CREATE INDEX IF NOT EXISTS idx_reservations_thanks_unsent
  ON reservations (date)
  WHERE thanks_mail_sent = FALSE AND status = 'completed' AND member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_reminder_unsent
  ON reservations (date, time)
  WHERE reminder_sent = FALSE AND status IN ('confirmed', 'pending');
