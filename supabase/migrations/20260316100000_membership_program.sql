-- ============================================================
-- 会員プログラム: point_settings / rank_settings / review_point_settings
-- ============================================================

-- 1. point_settings テーブル（ブランド別ポイント設定）
CREATE TABLE IF NOT EXISTS public.point_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT false,
  earn_rate_unit  integer NOT NULL DEFAULT 100,      -- ¥X につき
  earn_rate_point integer NOT NULL DEFAULT 1,        -- Y ポイント付与
  use_rate_point  integer NOT NULL DEFAULT 1,        -- Z ポイント ＝
  use_rate_yen    integer NOT NULL DEFAULT 1,        -- W 円
  expiry_months   integer NOT NULL DEFAULT 12,       -- 有効期限（月）
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id)
);

-- RLS
ALTER TABLE public.point_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_select_all" ON public.point_settings FOR SELECT USING (true);
CREATE POLICY "ps_insert_all" ON public.point_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "ps_update_all" ON public.point_settings FOR UPDATE USING (true);

-- 2. rank_settings テーブル（ランク段階定義）
CREATE TABLE IF NOT EXISTS public.rank_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  rank_name       text NOT NULL,
  icon            text DEFAULT '',
  sort_order      integer NOT NULL DEFAULT 0,
  is_default      boolean NOT NULL DEFAULT false,
  cond_monthly_count  integer DEFAULT 0,             -- 月間利用回数
  cond_total_spend    integer DEFAULT 0,             -- 累計利用金額
  benefit_point_multi numeric(4,2) DEFAULT 1.0,      -- ポイント倍率
  benefit_birthday    text DEFAULT '',               -- 誕生日クーポン（%OFF値）
  benefit_other       text DEFAULT '',               -- その他特典
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_brand ON public.rank_settings (brand_id, sort_order);

-- RLS
ALTER TABLE public.rank_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rs_select_all" ON public.rank_settings FOR SELECT USING (true);
CREATE POLICY "rs_insert_all" ON public.rank_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "rs_update_all" ON public.rank_settings FOR UPDATE USING (true);
CREATE POLICY "rs_delete_all" ON public.rank_settings FOR DELETE USING (true);

-- 3. review_point_settings テーブル（口コミポイント設定）
CREATE TABLE IF NOT EXISTS public.review_point_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT false,
  points_per_review   integer NOT NULL DEFAULT 50,   -- 1件あたり付与ポイント
  monthly_limit       integer NOT NULL DEFAULT 3,    -- 月あたり付与上限（回）
  review_link_expiry_days integer NOT NULL DEFAULT 7, -- 投稿リンク有効期限（日）
  approval_mode   text NOT NULL DEFAULT 'auto'       -- auto / manual
                  CHECK (approval_mode IN ('auto', 'manual')),
  google_place_id text DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id)
);

-- RLS
ALTER TABLE public.review_point_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rps_select_all" ON public.review_point_settings FOR SELECT USING (true);
CREATE POLICY "rps_insert_all" ON public.review_point_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "rps_update_all" ON public.review_point_settings FOR UPDATE USING (true);

-- 4. review_tokens テーブル（口コミ投稿用ワンタイムトークン）
CREATE TABLE IF NOT EXISTS public.review_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL,
  member_id       uuid NOT NULL,
  brand_id        uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  used            boolean NOT NULL DEFAULT false,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rt_token ON public.review_tokens (token);
CREATE INDEX IF NOT EXISTS idx_rt_order ON public.review_tokens (order_id);

-- RLS
ALTER TABLE public.review_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rt_select_all" ON public.review_tokens FOR SELECT USING (true);
CREATE POLICY "rt_insert_all" ON public.review_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "rt_update_all" ON public.review_tokens FOR UPDATE USING (true);

-- 5. members テーブルにランク関連カラム追加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'current_rank_id') THEN
    ALTER TABLE public.members ADD COLUMN current_rank_id uuid REFERENCES public.rank_settings(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'total_spend') THEN
    ALTER TABLE public.members ADD COLUMN total_spend integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'monthly_order_count') THEN
    ALTER TABLE public.members ADD COLUMN monthly_order_count integer DEFAULT 0;
  END IF;
END $$;

-- 6. point_transactions に brand_id カラムが無い場合は追加済み（compensation.sql）
-- source チェック制約を拡張: 'review' を追加
DO $$ BEGIN
  ALTER TABLE public.point_transactions
    DROP CONSTRAINT IF EXISTS point_transactions_source_check;
  ALTER TABLE public.point_transactions
    ADD CONSTRAINT point_transactions_source_check
    CHECK (source IN ('normal', 'aiden_compensation', 'review'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
