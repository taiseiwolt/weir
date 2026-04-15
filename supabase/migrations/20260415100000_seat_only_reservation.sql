-- Add nearest_station (for 最寄り駅 field in admin store detail)
-- Add seat_only_reservation (for 席のみ予約 toggle in サービス設定→来店予約)
-- Migration is idempotent: columns are only added if they don't already exist.
-- Note: seat_only_reservation already exists in production with DEFAULT TRUE; IF NOT EXISTS keeps it intact.

ALTER TABLE venues ADD COLUMN IF NOT EXISTS nearest_station TEXT DEFAULT '';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS seat_only_reservation BOOLEAN DEFAULT FALSE;
