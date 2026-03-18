-- Wave2-N: members集計値の自動更新トリガー + チャネルカラム + 月初リセット
-- 2026-03-18

-- ===== Task 2: orders INSERT/UPDATE 時に members の total_spend, monthly_order_count を自動更新 =====
CREATE OR REPLACE FUNCTION public.update_member_order_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.member_id IS NOT NULL) THEN
    UPDATE public.members
    SET total_spend = COALESCE(total_spend, 0) + COALESCE(NEW.total_amount, 0),
        monthly_order_count = COALESCE(monthly_order_count, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.member_id;
  ELSIF (TG_OP = 'UPDATE' AND NEW.member_id IS NOT NULL) THEN
    -- キャンセル時: 減算
    IF OLD.status != 'cancelled' AND NEW.status = 'cancelled' THEN
      UPDATE public.members
      SET total_spend = GREATEST(COALESCE(total_spend, 0) - COALESCE(NEW.total_amount, 0), 0),
          monthly_order_count = GREATEST(COALESCE(monthly_order_count, 0) - 1, 0),
          updated_at = NOW()
      WHERE id = NEW.member_id;
    END IF;
    -- 金額変更時: 差分反映
    IF OLD.total_amount IS DISTINCT FROM NEW.total_amount AND NEW.status != 'cancelled' AND OLD.status = NEW.status THEN
      UPDATE public.members
      SET total_spend = GREATEST(COALESCE(total_spend, 0) + COALESCE(NEW.total_amount, 0) - COALESCE(OLD.total_amount, 0), 0),
          updated_at = NOW()
      WHERE id = NEW.member_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_member_order_stats ON public.orders;
CREATE TRIGGER trg_update_member_order_stats
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_member_order_stats();

-- ===== Task 5: registration_channel カラム追加 =====
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS registration_channel TEXT DEFAULT 'web';
COMMENT ON COLUMN public.members.registration_channel IS '会員登録チャネル: web, line, app, store, referral';

-- ===== Task 6: pg_cron で monthly_order_count を毎月1日にリセット =====
-- pg_cron extension is already enabled
SELECT cron.schedule(
  'monthly-order-count-reset',
  '0 0 1 * *',
  $$UPDATE public.members SET monthly_order_count = 0, updated_at = NOW() WHERE monthly_order_count > 0$$
);
