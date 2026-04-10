-- =============================================================
-- reservations: ウォークイン登録サポート + 座席ステータス追加
-- 手動実行: Supabase Dashboard > SQL Editor
-- =============================================================
--
-- 目的:
--   1. status CHECK 制約に 'walkin' と 'seated' を追加
--      （Flutter aiden-pos で createWalkin / updateReservationStatus('seated') が失敗していた）
--   2. type カラムを追加（予約 vs ウォークインの区別）
--   3. checked_in_at / no_show_at カラムを追加
--      （updateReservationStatus で既に参照されていたが未定義だった）
--
-- 影響範囲:
--   - 既存データ: 破壊しない（すべてDEFAULT/NULL許容）
--   - 既存ポリシー: 変更なし
-- =============================================================

-- -----------------------------------------------------------
-- 1. status CHECK 制約を更新（walkin / seated を許可）
-- -----------------------------------------------------------
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN (
    'pending',
    'confirmed',
    'cancelled',
    'cancel_requested',
    'no_show',
    'completed',
    'walkin',
    'seated'
  ));

-- -----------------------------------------------------------
-- 2. type カラム（予約 / ウォークインの区別）
-- -----------------------------------------------------------
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'reservation'
  CHECK (type IN ('reservation', 'walkin'));

-- -----------------------------------------------------------
-- 3. 座席ステータス遷移用タイムスタンプ
-- -----------------------------------------------------------
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;

-- -----------------------------------------------------------
-- 4. インデックス追加（ウォークイン一覧のフィルタ高速化）
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reservations_type_date
  ON reservations(type, date);
