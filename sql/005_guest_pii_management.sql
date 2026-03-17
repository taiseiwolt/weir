-- ============================================================
-- AIden Step 5: ゲスト注文者PII管理 + 会員転換促進
-- 実行場所: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. guest_order_summaries ビュー作成
--    ゲスト注文をハッシュ化IDで集計。氏名・メールは含めない。
--    加盟店に共有するのは注文回数・最終注文日時・合計額・店舗別内訳のみ。
-- ============================================================

-- pgcrypto 拡張を有効化（sha256 に必要）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE VIEW guest_order_summaries AS
SELECT
  encode(digest(
    (COALESCE(o.customer_email, '') || '::' || COALESCE(o.customer_phone, '')),
    'sha256'), 'hex') AS guest_identifier,
  o.store_id,
  s.name AS store_name,
  s.brand_id,
  COUNT(*)::int AS order_count,
  SUM(o.total_amount)::numeric AS total_amount,
  MAX(o.created_at) AS last_order_at
FROM orders o
LEFT JOIN stores s ON s.id = o.store_id
WHERE o.member_id IS NULL
  AND o.customer_email IS NOT NULL
GROUP BY 1, o.store_id, s.name, s.brand_id;

-- RLS: ビューは基本テーブルのRLSを継承するが、明示的にGRANTしておく
GRANT SELECT ON guest_order_summaries TO anon, authenticated;

-- 2. guest_registration_prompt テーブル
--    ゲスト注文完了後の会員登録促進バナー設定
-- ============================================================

CREATE TABLE IF NOT EXISTS guest_registration_prompt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  prompt_message TEXT DEFAULT '会員登録すると次回のご注文がもっと便利に！',
  incentive_text TEXT DEFAULT '今なら100ポイントプレゼント！',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id)
);

-- RLS
ALTER TABLE guest_registration_prompt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_registration_prompt_select_public" ON guest_registration_prompt;
CREATE POLICY "guest_registration_prompt_select_public" ON guest_registration_prompt
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "guest_registration_prompt_service_role_all" ON guest_registration_prompt;
CREATE POLICY "guest_registration_prompt_service_role_all" ON guest_registration_prompt
  FOR ALL USING (auth.role() = 'service_role');

-- updated_at トリガー
DROP TRIGGER IF EXISTS set_guest_registration_prompt_updated_at ON guest_registration_prompt;
CREATE TRIGGER set_guest_registration_prompt_updated_at
  BEFORE UPDATE ON guest_registration_prompt
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. orders テーブルにゲスト用カラムが不足している場合は追加
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_email') THEN
    ALTER TABLE orders ADD COLUMN customer_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_phone') THEN
    ALTER TABLE orders ADD COLUMN customer_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_name') THEN
    ALTER TABLE orders ADD COLUMN customer_name TEXT;
  END IF;
END
$$;

-- インデックス（ゲスト注文の検索高速化）
CREATE INDEX IF NOT EXISTS idx_orders_guest ON orders(member_id) WHERE member_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
