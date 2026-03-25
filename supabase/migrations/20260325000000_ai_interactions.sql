-- ============================================================
-- AI Interactions Table + STD Free Tier Counting
-- ============================================================

-- 1. ai_interactions テーブル
CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL, -- 'review_reply', 'sns_post', 'pop_image', 'monthly_comment'
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  model TEXT, -- 'claude-sonnet-4-20250514', 'dall-e-3' etc.
  status TEXT DEFAULT 'completed', -- 'completed', 'failed', 'pending'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. インデックス
CREATE INDEX IF NOT EXISTS idx_ai_interactions_store_type_created
  ON ai_interactions (store_id, interaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_brand
  ON ai_interactions (brand_id) WHERE brand_id IS NOT NULL;

-- 3. updated_at トリガー
CREATE OR REPLACE FUNCTION update_ai_interactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_interactions_updated_at ON ai_interactions;
CREATE TRIGGER trg_ai_interactions_updated_at
  BEFORE UPDATE ON ai_interactions
  FOR EACH ROW EXECUTE FUNCTION update_ai_interactions_updated_at();

-- 4. RLS
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーがあれば削除してから再作成
DROP POLICY IF EXISTS "service_role_full_access" ON ai_interactions;
DROP POLICY IF EXISTS "authenticated_select_own_store" ON ai_interactions;

-- service_role: 全操作
CREATE POLICY "service_role_full_access" ON ai_interactions
  TO service_role USING (true) WITH CHECK (true);

-- authenticated: 自ブランド配下店舗のSELECTのみ
CREATE POLICY "authenticated_select_own_store" ON ai_interactions
  FOR SELECT TO authenticated
  USING (
    store_id IN (
      SELECT s.id FROM stores s
      WHERE s.brand_id IN (
        SELECT sa.brand_id FROM staff_accounts sa WHERE sa.auth_user_id = auth.uid()
      )
    )
  );

-- 5. 月次利用回数集計ビュー
CREATE OR REPLACE VIEW ai_monthly_usage AS
SELECT
  store_id,
  interaction_type,
  date_trunc('month', created_at) AS month,
  COUNT(*) AS usage_count
FROM ai_interactions
WHERE status = 'completed'
GROUP BY store_id, interaction_type, date_trunc('month', created_at);

-- 6. STD無料枠チェック関数
CREATE OR REPLACE FUNCTION check_ai_quota(
  p_store_id UUID,
  p_interaction_type TEXT
) RETURNS JSONB AS $$
DECLARE
  v_plan TEXT;
  v_current_count INTEGER;
  v_limit INTEGER;
  v_brand_id UUID;
BEGIN
  -- store → brand → plan判定
  SELECT s.brand_id INTO v_brand_id
  FROM stores s WHERE s.id = p_store_id;

  -- service_subscriptions からプラン判定
  IF EXISTS (
    SELECT 1 FROM service_subscriptions
    WHERE entity_type = 'brand' AND entity_id = v_brand_id
    AND service_key = 'ai_expert' AND is_active = true
  ) THEN
    v_plan := 'EXPERT';
  ELSIF EXISTS (
    SELECT 1 FROM service_subscriptions
    WHERE entity_type = 'brand' AND entity_id = v_brand_id
    AND service_key = 'ai_pro' AND is_active = true
  ) THEN
    v_plan := 'PRO';
  ELSE
    v_plan := 'STANDARD';
  END IF;

  -- PRO/EXPERT → 上限なし
  IF v_plan IN ('PRO', 'EXPERT') THEN
    RETURN jsonb_build_object('allowed', true, 'plan', v_plan, 'remaining', -1);
  END IF;

  -- STD無料枠
  CASE p_interaction_type
    WHEN 'review_reply' THEN v_limit := 10;
    WHEN 'sns_post' THEN v_limit := 10;
    WHEN 'pop_image' THEN v_limit := 1;
    WHEN 'monthly_comment' THEN v_limit := 1;
    ELSE v_limit := 0;
  END CASE;

  -- 当月の利用回数
  SELECT COUNT(*) INTO v_current_count
  FROM ai_interactions
  WHERE store_id = p_store_id
    AND interaction_type = p_interaction_type
    AND status = 'completed'
    AND created_at >= date_trunc('month', now());

  IF v_current_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'plan', v_plan,
      'remaining', 0,
      'limit', v_limit,
      'used', v_current_count,
      'message', '無料枠の上限に達しました。PROプランにアップグレードすると無制限で利用できます。'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'plan', v_plan,
    'remaining', v_limit - v_current_count,
    'limit', v_limit,
    'used', v_current_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
