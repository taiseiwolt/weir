-- =============================================
-- FCモデル対応マイグレーション
-- 1. corporation_brand_relations（多対多）
-- 2. brands.corp_id FK を CASCADE → SET NULL に変更
-- 3. stores.corp_id 追加（運営法人）
-- 4. store_corp_history（運営法人変更ログ）
-- 5. invoices スナップショットカラム追加
-- =============================================

-- 1. corporation_brand_relations テーブル
CREATE TABLE IF NOT EXISTS public.corporation_brand_relations (
  corp_id    UUID NOT NULL REFERENCES public.corporations(id) ON DELETE CASCADE,
  brand_id   UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner'
               CHECK (role IN ('owner','fc_operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (corp_id, brand_id)
);
ALTER TABLE public.corporation_brand_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.corporation_brand_relations
  TO service_role USING (true) WITH CHECK (true);

-- 2. 既存の brands.corp_id データを relations に移行（role='owner'）
INSERT INTO public.corporation_brand_relations (corp_id, brand_id, role)
SELECT corp_id, id, 'owner'
FROM public.brands
WHERE corp_id IS NOT NULL
ON CONFLICT (corp_id, brand_id) DO NOTHING;

-- 3. brands.corp_id の FK を ON DELETE SET NULL に変更
-- ※ 既存FK制約名を確認してから DROP → ADD する
DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT rc.constraint_name INTO v_name
  FROM information_schema.referential_constraints rc
  JOIN information_schema.key_column_usage kcu
    ON rc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
  WHERE kcu.table_name = 'brands'
    AND kcu.column_name = 'corp_id'
    AND ccu.table_name = 'corporations'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.brands DROP CONSTRAINT ' || quote_ident(v_name);
  END IF;
END $$;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_corp_id_fkey
  FOREIGN KEY (corp_id)
  REFERENCES public.corporations(id)
  ON DELETE SET NULL;

-- 4. stores.corp_id 追加（運営法人：ON DELETE SET NULL）
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS corp_id UUID
  REFERENCES public.corporations(id) ON DELETE SET NULL;

-- 既存 stores の corp_id を brands.corp_id から自動移行
UPDATE public.stores s
SET corp_id = b.corp_id
FROM public.brands b
WHERE s.brand_id = b.id
  AND b.corp_id IS NOT NULL
  AND s.corp_id IS NULL;

-- 5. store_corp_history（運営法人変更ログ）
CREATE TABLE IF NOT EXISTS public.store_corp_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  corp_id    UUID REFERENCES public.corporations(id) ON DELETE SET NULL,
  corp_name_snapshot TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ,
  changed_by TEXT
);
ALTER TABLE public.store_corp_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.store_corp_history
  TO service_role USING (true) WITH CHECK (true);

-- 既存 stores の初期履歴を挿入
INSERT INTO public.store_corp_history (store_id, corp_id, corp_name_snapshot, started_at)
SELECT s.id, s.corp_id, c.name, s.created_at
FROM public.stores s
JOIN public.corporations c ON c.id = s.corp_id
WHERE s.corp_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. invoices スナップショットカラム追加
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS corp_name_snapshot TEXT;

-- 既存 invoices の corp_name_snapshot を補完
UPDATE public.invoices i
SET corp_name_snapshot = c.name
FROM public.corporations c
WHERE i.corp_id = c.id
  AND i.corp_name_snapshot IS NULL;
