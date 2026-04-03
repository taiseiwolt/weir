-- ============================================================
-- admin_display_ids: corporations テーブル作成 + display_id整備 + RLS
-- ============================================================

-- ============================================================
-- 1. corporations テーブル作成（存在しない場合）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.corporations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  representative TEXT,
  status TEXT DEFAULT 'active',
  website_url TEXT,
  recruit_url TEXT,
  rep_email TEXT,
  stripe_account_id TEXT,
  display_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. 既存 brands.corp_id からの法人データ復元
--    brands に存在する corp_id で corporations にまだ無いものを INSERT
-- ============================================================
INSERT INTO public.corporations (id, name, status)
SELECT DISTINCT b.corp_id, '法人 ' || ROW_NUMBER() OVER (ORDER BY b.corp_id), 'active'
FROM public.brands b
WHERE b.corp_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.corporations c WHERE c.id = b.corp_id)
ON CONFLICT (id) DO NOTHING;

-- 既知の法人名を更新（シードデータから判明しているもの）
UPDATE public.corporations SET name = '株式会社スミビフーズ', representative = '近重 泰輔', rep_email = 'taisei@sumbibi.com'
WHERE id = '11111111-0000-0000-0000-000000000001';
UPDATE public.corporations SET name = '株式会社スミビフーズ第二', representative = '近重 泰輔'
WHERE id = '11111111-0000-0000-0000-000000000002';
UPDATE public.corporations SET name = '株式会社焼肉キングHD', representative = '山田 太郎'
WHERE id = 'aaaa0001-0000-0000-0000-000000000001';
UPDATE public.corporations SET name = '株式会社麺匠', representative = '田中 一郎'
WHERE id = 'bbbb0001-0000-0000-0000-000000000001';
UPDATE public.corporations SET name = '株式会社おにぎり本舗', representative = '佐藤 花子'
WHERE id = 'cccc0001-0000-0000-0000-000000000001';
UPDATE public.corporations SET name = '株式会社海鮮酒場', representative = '鈴木 健太'
WHERE id = 'eeee0001-0000-0000-0000-000000000001';

-- ============================================================
-- 3. display_id カラム追加（brands, stores は既にある場合スキップ）
-- ============================================================
-- corporations の display_id 生成（上で CREATE TABLE に含めたが念のため）
UPDATE public.corporations
SET display_id = 'CRP-' || substr(md5(random()::text), 1, 7)
WHERE display_id IS NULL;

ALTER TABLE public.corporations ALTER COLUMN display_id SET NOT NULL;

-- brands: display_id が既に存在するならスキップ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='display_id') THEN
    ALTER TABLE public.brands ADD COLUMN display_id TEXT UNIQUE;
    UPDATE public.brands SET display_id = 'BRD-' || substr(md5(random()::text), 1, 7) WHERE display_id IS NULL;
    ALTER TABLE public.brands ALTER COLUMN display_id SET NOT NULL;
  END IF;
END $$;

-- stores: display_id が既に存在するならスキップ
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name='display_id') THEN
    ALTER TABLE public.stores ADD COLUMN display_id TEXT UNIQUE;
    UPDATE public.stores SET display_id = 'STR-' || substr(md5(random()::text), 1, 7) WHERE display_id IS NULL;
    ALTER TABLE public.stores ALTER COLUMN display_id SET NOT NULL;
  END IF;
END $$;

-- staff_accounts: display_id 追加
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_accounts' AND column_name='display_id') THEN
      ALTER TABLE public.staff_accounts ADD COLUMN display_id TEXT UNIQUE;
      UPDATE public.staff_accounts SET display_id = 'ACC-' || substr(md5(random()::text), 1, 7) WHERE display_id IS NULL;
      ALTER TABLE public.staff_accounts ALTER COLUMN display_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 4. インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_corporations_display_id ON public.corporations (display_id);
CREATE INDEX IF NOT EXISTS idx_brands_display_id ON public.brands (display_id);
CREATE INDEX IF NOT EXISTS idx_stores_display_id ON public.stores (display_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='staff_accounts' AND indexname='idx_staff_accounts_display_id') THEN
      CREATE INDEX idx_staff_accounts_display_id ON public.staff_accounts (display_id);
    END IF;
  END IF;
END $$;

-- ============================================================
-- 5. RLS ポリシー
-- ============================================================
ALTER TABLE public.corporations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='corporations' AND policyname='corporations_select_authenticated') THEN
    CREATE POLICY "corporations_select_authenticated" ON public.corporations FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='corporations' AND policyname='corporations_all_service_role') THEN
    CREATE POLICY "corporations_all_service_role" ON public.corporations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- brands
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='brands' AND policyname='brands_select_authenticated') THEN
    CREATE POLICY "brands_select_authenticated" ON public.brands FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stores' AND policyname='stores_select_authenticated') THEN
    CREATE POLICY "stores_select_authenticated" ON public.stores FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- service_subscriptions
ALTER TABLE public.service_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='service_subscriptions' AND policyname='service_subscriptions_select_authenticated') THEN
    CREATE POLICY "service_subscriptions_select_authenticated" ON public.service_subscriptions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='service_subscriptions' AND policyname='service_subscriptions_all_service_role') THEN
    CREATE POLICY "service_subscriptions_all_service_role" ON public.service_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
