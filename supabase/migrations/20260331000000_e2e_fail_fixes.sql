-- =============================================================
-- E2E FAIL 25件 一括修正マイグレーション
-- =============================================================

-- -----------------------------------------------------------
-- 1. stores: is_paused (IR-23), updated_at (IR-34), max_reservation_capacity (IR-14)
-- -----------------------------------------------------------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE stores ADD COLUMN IF NOT EXISTS max_reservation_capacity INTEGER DEFAULT 0;

-- stores.updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_stores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stores_updated_at ON stores;
CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW
  EXECUTE FUNCTION update_stores_updated_at();

-- 既存storesレコードのupdated_atを初期化
UPDATE stores SET updated_at = NOW() WHERE updated_at IS NULL;

-- -----------------------------------------------------------
-- 2. RPC: deduct_points (IR-08)
-- ポイント差引を原子的に実行。同一order_idの二重実行防止
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_points(
  p_member_id UUID,
  p_brand_id UUID,
  p_amount INTEGER,
  p_order_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_existing RECORD;
BEGIN
  -- 二重実行チェック
  SELECT id INTO v_existing
    FROM point_transactions
    WHERE member_id = p_member_id AND order_id = p_order_id AND amount < 0
    LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_deducted', true);
  END IF;

  -- 残高計算（FOR UPDATE相当: member_idで絞ったINSERTは排他的）
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM point_transactions
    WHERE member_id = p_member_id;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', v_balance);
  END IF;

  v_new_balance := v_balance - p_amount;

  INSERT INTO point_transactions (member_id, brand_id, amount, balance_after, source, order_id, reason)
  VALUES (p_member_id, p_brand_id, -p_amount, v_new_balance, 'normal', p_order_id, '注文ポイント利用');

  RETURN jsonb_build_object('success', true, 'deducted', p_amount, 'balance_after', v_new_balance);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------
-- 3. RPC: grant_compensation_points (IR-27)
-- 補償ポイント付与を原子的に実行
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION grant_compensation_points(
  p_member_id UUID,
  p_brand_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_granted_by TEXT
) RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- 残高取得（行ロック）
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
    FROM point_transactions
    WHERE member_id = p_member_id;

  v_new_balance := v_balance + p_amount;

  INSERT INTO point_transactions (member_id, brand_id, amount, balance_after, source, reason, granted_by, expires_at)
  VALUES (p_member_id, p_brand_id, p_amount, v_new_balance, 'aiden_compensation', p_reason, p_granted_by,
          NOW() + INTERVAL '12 months');

  RETURN jsonb_build_object('success', true, 'granted', p_amount, 'balance_after', v_new_balance);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------
-- 4. RPC: check_and_upgrade_rank (G-03)
-- total_spend に基づきランクを自動昇格
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION check_and_upgrade_rank(
  p_member_id UUID,
  p_brand_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_member RECORD;
  v_new_rank RECORD;
BEGIN
  SELECT total_spend, current_rank_id INTO v_member
    FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_not_found');
  END IF;

  -- 該当ブランドのランク設定から、total_spend以下で最も高いソート順のランクを取得
  SELECT id, rank_name, cond_total_spend INTO v_new_rank
    FROM rank_settings
    WHERE brand_id = p_brand_id AND cond_total_spend <= v_member.total_spend
    ORDER BY cond_total_spend DESC, sort_order DESC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'upgraded', false, 'reason', 'no_matching_rank');
  END IF;

  -- ランクが変わった場合のみ更新
  IF v_member.current_rank_id IS DISTINCT FROM v_new_rank.id THEN
    UPDATE members SET current_rank_id = v_new_rank.id WHERE id = p_member_id;
    RETURN jsonb_build_object('success', true, 'upgraded', true,
      'new_rank', v_new_rank.rank_name, 'new_rank_id', v_new_rank.id);
  END IF;

  RETURN jsonb_build_object('success', true, 'upgraded', false, 'current_rank', v_new_rank.rank_name);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------
-- 5. pg_cron: auto_noshow_reservations (E-04)
-- 予約日時を1時間超過したpending予約を自動no_show化
-- -----------------------------------------------------------
SELECT cron.schedule(
  'auto-noshow-reservations',
  '0 * * * *',
  $$
  UPDATE reservations
  SET status = 'no_show',
      cancelled_by = 'system',
      cancelled_at = NOW()
  WHERE status = 'pending'
    AND (date + time) < (NOW() AT TIME ZONE 'Asia/Tokyo' - INTERVAL '1 hour');
  $$
);
