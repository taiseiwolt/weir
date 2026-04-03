-- ============================================================
-- service_subscription_billing: 課金関連カラム追加
-- ============================================================

-- 課金関連カラム
ALTER TABLE public.service_subscriptions ADD COLUMN IF NOT EXISTS plan_price INTEGER DEFAULT 0;
ALTER TABLE public.service_subscriptions ADD COLUMN IF NOT EXISTS downgrade_at DATE;
ALTER TABLE public.service_subscriptions ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.service_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Upsert 用ユニーク制約
CREATE UNIQUE INDEX IF NOT EXISTS idx_svc_subs_entity_key
  ON public.service_subscriptions (entity_type, entity_id, service_key);
