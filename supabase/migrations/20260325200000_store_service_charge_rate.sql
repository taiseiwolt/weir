-- ============================================================
-- Add service_charge_rate to stores (per-store service fee %)
-- ============================================================
-- デフォルト 0.00（サービス料なし）
-- 店舗ごとにサービス料率を設定可能にする

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS service_charge_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0000;

-- 既存の全店舗を 0.00 に設定（デフォルトoff）
-- カラム追加時の DEFAULT で自動適用されるが、明示的に更新
UPDATE stores SET service_charge_rate = 0.0000 WHERE service_charge_rate != 0.0000;

COMMENT ON COLUMN stores.service_charge_rate IS 'サービス料率（0.0000〜1.0000）。0=サービス料なし、0.10=10%';
