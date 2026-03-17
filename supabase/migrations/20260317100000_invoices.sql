-- ============================================================
-- 請求管理: invoices テーブル拡張 + orders カラム追加
-- ============================================================

-- 1. invoices テーブルにカラム追加（既存テーブルを拡張）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='adjustments') THEN
    ALTER TABLE public.invoices ADD COLUMN adjustments integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='adjustment_details') THEN
    ALTER TABLE public.invoices ADD COLUMN adjustment_details jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='pdf_url') THEN
    ALTER TABLE public.invoices ADD COLUMN pdf_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='billing_period') THEN
    ALTER TABLE public.invoices ADD COLUMN billing_period text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_corp_period
  ON public.invoices (corp_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON public.invoices (status);

-- RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select_all" ON public.invoices;
CREATE POLICY "invoices_select_all" ON public.invoices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "invoices_service_role_all" ON public.invoices;
CREATE POLICY "invoices_service_role_all" ON public.invoices
  FOR ALL USING (auth.role() = 'service_role');

-- 2. orders テーブルにカラム追加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'application_fee_amount') THEN
    ALTER TABLE public.orders ADD COLUMN application_fee_amount integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'corp_id') THEN
    ALTER TABLE public.orders ADD COLUMN corp_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'brand_id') THEN
    ALTER TABLE public.orders ADD COLUMN brand_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_corp_created
  ON public.orders (corp_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_brand_created
  ON public.orders (brand_id, created_at);
