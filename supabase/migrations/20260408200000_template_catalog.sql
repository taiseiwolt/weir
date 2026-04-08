-- Template Catalog System
-- テンプレートカタログ（AIden運営側管理）+ ブランド×テンプレート紐付け

-- 1. templates テーブル
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ja TEXT NOT NULL,
  description TEXT DEFAULT '',
  target_genres TEXT[] DEFAULT '{}',
  default_colors JSONB DEFAULT '{"primary":"#000000","secondary":"#FFFFFF","accent":"#FF0000"}',
  default_font TEXT DEFAULT 'Noto Sans JP',
  preview_image_url TEXT DEFAULT '',
  css_file TEXT NOT NULL,
  layout_config JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 初期データINSERT（5テンプレート）
INSERT INTO templates (id, name, name_ja, description, target_genres, default_colors, default_font, css_file, layout_config, sort_order) VALUES
('TPL-A', 'SILENT CURATOR', '写真訴求', '写真で魅せる、世界観で選ばれる。カフェ・パン屋・スイーツ店に最適。', ARRAY['カフェ','パン屋','スイーツ','ベーカリー'], '{"primary":"#2D5A3D","secondary":"#FFFFFF","accent":"#D4C5A9"}', 'Noto Sans JP', 'template-a/style.css', '{"hero":"fullscreen_image","menu":"photo_grid","sections":["hero","about","menu","gallery","news","access","footer"]}', 1),
('TPL-B', 'DONMARU', '効率特化', '速さが正義、クーポンで回す。牛丼・定食・弁当チェーンに最適。', ARRAY['牛丼','定食','弁当','ファストフード'], '{"primary":"#D32F2F","secondary":"#FFC107","accent":"#FFFFFF"}', 'Noto Sans JP', 'template-b/style.css', '{"hero":"coupon_banner","menu":"list_compact","sections":["hero","coupon","menu","pickup","access","footer"]}', 2),
('TPL-C', 'TSUKISHIRO', '予約特化', '期待感を醸成し、予約に導く。懐石・フレンチ・高級寿司に最適。', ARRAY['懐石','フレンチ','高級寿司','割烹','イタリアン'], '{"primary":"#1A237E","secondary":"#FFD700","accent":"#FFFFFF"}', 'Noto Serif JP', 'template-c/style.css', '{"hero":"cinematic","menu":"course_focus","sections":["hero","concept","chef","course","reservation","gallery","access","footer"]}', 3),
('TPL-D', 'NAMI BOWL', '自由組立', '自分だけの一杯を組み立てる。ポケボウル・サラダ・選べる丼に最適。', ARRAY['ポケボウル','サラダ','カスタマイズ','ボウル'], '{"primary":"#00897B","secondary":"#FF9800","accent":"#FFFFFF"}', 'M PLUS Rounded 1c', 'template-d/style.css', '{"hero":"step_builder","menu":"build_your_own","sections":["hero","howto","menu","builder","nutrition","access","footer"]}', 4),
('TPL-E', 'REKKA', '好み調整', 'こだわりの一杯を好みに調整。ラーメン・カレー・うどんに最適。', ARRAY['ラーメン','カレー','うどん','つけ麺','居酒屋'], '{"primary":"#B71C1C","secondary":"#FFF8E1","accent":"#212121"}', 'Noto Sans JP', 'template-e/style.css', '{"hero":"dramatic","menu":"parameter_adjust","sections":["hero","philosophy","menu","customize","reviews","access","footer"]}', 5)
ON CONFLICT (id) DO NOTHING;

-- 3. brand_templates テーブル
CREATE TABLE IF NOT EXISTS brand_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id),
  selected_at TIMESTAMPTZ DEFAULT now(),
  css_setup_completed_at TIMESTAMPTZ,
  css_locked_at TIMESTAMPTZ,
  css_reset_used BOOLEAN DEFAULT false,
  custom_css TEXT DEFAULT '',
  customization JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand_id)
);

-- 4. RLSポリシー
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_public_read" ON templates FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "templates_service_write" ON templates TO service_role USING (true) WITH CHECK (true);

ALTER TABLE brand_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_templates_service" ON brand_templates TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "brand_templates_auth_read" ON brand_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "brand_templates_auth_write" ON brand_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. updated_at トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_templates_updated_at') THEN
    CREATE TRIGGER set_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_brand_templates_updated_at') THEN
    CREATE TRIGGER set_brand_templates_updated_at BEFORE UPDATE ON brand_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END$$;
