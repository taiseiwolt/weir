-- ============================================================
-- admin_display_ids: display_id カラム追加 + RLS整備
-- corporations, brands, stores, staff_accounts, service_subscriptions
-- ============================================================

-- ============================================================
-- 1. display_id カラム追加
-- ============================================================

-- corporations
ALTER TABLE public.corporations ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;

-- brands
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;

-- stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;

-- staff_accounts (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff_accounts' AND column_name = 'display_id') THEN
      ALTER TABLE public.staff_accounts ADD COLUMN display_id TEXT UNIQUE;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 2. display_id 生成（既存行）
-- ============================================================

UPDATE public.corporations
SET display_id = 'CRP-' || substr(md5(random()::text), 1, 7)
WHERE display_id IS NULL;

UPDATE public.brands
SET display_id = 'BRD-' || substr(md5(random()::text), 1, 7)
WHERE display_id IS NULL;

UPDATE public.stores
SET display_id = 'STR-' || substr(md5(random()::text), 1, 7)
WHERE display_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_accounts') THEN
    EXECUTE 'UPDATE public.staff_accounts SET display_id = ''ACC-'' || substr(md5(random()::text), 1, 7) WHERE display_id IS NULL';
  END IF;
END $$;

-- ============================================================
-- 3. NOT NULL 制約追加
-- ============================================================

ALTER TABLE public.corporations ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE public.brands ALTER COLUMN display_id SET NOT NULL;
ALTER TABLE public.stores ALTER COLUMN display_id SET NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_accounts') THEN
    ALTER TABLE public.staff_accounts ALTER COLUMN display_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 4. インデックス作成
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_corporations_display_id ON public.corporations (display_id);
CREATE INDEX IF NOT EXISTS idx_brands_display_id ON public.brands (display_id);
CREATE INDEX IF NOT EXISTS idx_stores_display_id ON public.stores (display_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'staff_accounts' AND indexname = 'idx_staff_accounts_display_id') THEN
      CREATE INDEX idx_staff_accounts_display_id ON public.staff_accounts (display_id);
    END IF;
  END IF;
END $$;

-- ============================================================
-- 5. corporations 追加カラム
-- ============================================================

ALTER TABLE public.corporations ADD COLUMN IF NOT EXISTS rep_email TEXT;
ALTER TABLE public.corporations ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

-- ============================================================
-- 6. RLS ポリシー
-- ============================================================

-- corporations
ALTER TABLE public.corporations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'corporations' AND policyname = 'corporations_select_authenticated') THEN
    CREATE POLICY "corporations_select_authenticated" ON public.corporations
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'corporations' AND policyname = 'corporations_all_service_role') THEN
    CREATE POLICY "corporations_all_service_role" ON public.corporations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- brands
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brands' AND policyname = 'brands_select_authenticated') THEN
    CREATE POLICY "brands_select_authenticated" ON public.brands
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stores' AND policyname = 'stores_select_authenticated') THEN
    CREATE POLICY "stores_select_authenticated" ON public.stores
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- service_subscriptions
ALTER TABLE public.service_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_subscriptions' AND policyname = 'service_subscriptions_select_authenticated') THEN
    CREATE POLICY "service_subscriptions_select_authenticated" ON public.service_subscriptions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_subscriptions' AND policyname = 'service_subscriptions_all_service_role') THEN
    CREATE POLICY "service_subscriptions_all_service_role" ON public.service_subscriptions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
