-- ============================================================
-- 補償機能: point_transactions テーブル作成 + orders カラム追加
-- ============================================================

-- 1. point_transactions テーブル
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL,
  brand_id        uuid REFERENCES public.brands(id),
  amount          integer NOT NULL,          -- 正=獲得, 負=消費
  balance_after   integer NOT NULL,          -- この取引後の残高
  source          text NOT NULL DEFAULT 'normal'
                  CHECK (source IN ('normal', 'aiden_compensation')),
  reason          text,                      -- 取引理由（補償時は必須）
  order_id        uuid,                      -- 関連注文ID
  granted_by      text,                      -- 補償付与した管理者名
  expires_at      timestamptz,               -- ポイント有効期限
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pt_member_created
  ON public.point_transactions (member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pt_source
  ON public.point_transactions (source);
CREATE INDEX IF NOT EXISTS idx_pt_order
  ON public.point_transactions (order_id);

-- RLS
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_select_all" ON public.point_transactions
  FOR SELECT USING (true);

CREATE POLICY "pt_insert_service" ON public.point_transactions
  FOR INSERT WITH CHECK (true);

-- 2. orders テーブルにカラム追加
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_status') THEN
    ALTER TABLE public.orders
      ADD COLUMN payment_status text DEFAULT 'paid'
      CHECK (payment_status IN ('pending', 'paid', 'refunded', 'partially_refunded'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_intent_id') THEN
    ALTER TABLE public.orders ADD COLUMN payment_intent_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refund_amount') THEN
    ALTER TABLE public.orders ADD COLUMN refund_amount integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refund_reason') THEN
    ALTER TABLE public.orders ADD COLUMN refund_reason text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded_at') THEN
    ALTER TABLE public.orders ADD COLUMN refunded_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded_by') THEN
    ALTER TABLE public.orders ADD COLUMN refunded_by text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'aiden_points_used') THEN
    ALTER TABLE public.orders ADD COLUMN aiden_points_used integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'normal_points_used') THEN
    ALTER TABLE public.orders ADD COLUMN normal_points_used integer DEFAULT 0;
  END IF;
END $$;
