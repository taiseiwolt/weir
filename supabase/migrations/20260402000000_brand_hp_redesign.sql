-- brand HP redesign: custom_domain, hero_slides, campaigns, news body

-- 1. Add custom_domain to brands table
ALTER TABLE brands ADD COLUMN IF NOT EXISTS custom_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS brands_custom_domain_unique
  ON brands (custom_domain) WHERE custom_domain IS NOT NULL;

-- 2. Create brand_hero_slides table
CREATE TABLE IF NOT EXISTS brand_hero_slides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  media_url    TEXT NOT NULL,
  media_type   TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  alt_text     TEXT,
  sort_order   INT DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_hero_slides_brand_sort_idx
  ON brand_hero_slides (brand_id, sort_order);

ALTER TABLE brand_hero_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON brand_hero_slides
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_active" ON brand_hero_slides
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "authenticated_read_active" ON brand_hero_slides
  FOR SELECT TO authenticated
  USING (is_active = true);

-- updated_at auto-update for brand_hero_slides
CREATE OR REPLACE FUNCTION update_brand_hero_slides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_hero_slides_updated_at
  BEFORE UPDATE ON brand_hero_slides
  FOR EACH ROW EXECUTE FUNCTION update_brand_hero_slides_updated_at();

-- 3. Create brand_campaigns table
CREATE TABLE IF NOT EXISTS brand_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  media_url    TEXT,
  media_type   TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  link_url     TEXT,
  start_date   DATE,
  end_date     DATE,
  sort_order   INT DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_campaigns_brand_sort_idx
  ON brand_campaigns (brand_id, sort_order);

CREATE INDEX IF NOT EXISTS brand_campaigns_date_range_idx
  ON brand_campaigns (start_date, end_date);

ALTER TABLE brand_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON brand_campaigns
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_active" ON brand_campaigns
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "authenticated_read_active" ON brand_campaigns
  FOR SELECT TO authenticated
  USING (is_active = true);

-- updated_at auto-update for brand_campaigns
CREATE OR REPLACE FUNCTION update_brand_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_campaigns_updated_at
  BEFORE UPDATE ON brand_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_brand_campaigns_updated_at();

-- 4. Add body_html to brand_news table
ALTER TABLE brand_news ADD COLUMN IF NOT EXISTS body_html TEXT;
