# Phase 2: ブランド管理オーバーホール Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブランド管理の全12タブをDB永続化し、ハードコード排除・CRUD動作・FC権限制御を実装する

**Architecture:** 単一ファイル `aiden-admin.html` 内のブランド管理セクションを段階的に改修。DB拡張（brandsカラム追加 + brand_couponsテーブル新設）→ 設定系タブDB永続化 → コンテンツ系タブCRUD → メニューパターン連携 → 残りタブ+FC権限制御の5段階。全CRUD操作はSupabase JS Client直接呼出し。

**Tech Stack:** Vanilla JS, Supabase JS Client v2, PostgreSQL 15, RLS

---

## File Structure

- **Modify:** `aiden-admin.html` — 全ブランドタブのJS関数改修（~1399-1421行のrenderBrandPage + 新規関数追加）
- **Create:** `supabase/migrations/20260405100000_phase2_brand_extensions.sql` — DB拡張マイグレーション（手動実行用）

---

### Task 1: DB拡張マイグレーション作成

**Files:**
- Create: `supabase/migrations/20260405100000_phase2_brand_extensions.sql`

- [ ] **Step 1: マイグレーションSQL作成**

```sql
-- ============================================================
-- Phase 2: Brand Extensions
-- brands追加カラム + brand_couponsテーブル
-- 2026-04-05
-- ============================================================

-- 1. brands テーブル拡張
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_unique ON brands (slug) WHERE slug IS NOT NULL;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS font_families TEXT[] DEFAULT ARRAY['Noto Sans JP'];
ALTER TABLE brands ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS service_settings JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS design_settings JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS hp_settings JSONB DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS cancel_policy JSONB DEFAULT '{"no_show":100,"same_day":100,"3_days_before":50}';

-- 2. brand_coupons テーブル
CREATE TABLE IF NOT EXISTS brand_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC NOT NULL,
  target_services TEXT[] DEFAULT ARRAY['dinein', 'takeout', 'delivery'],
  target_platforms TEXT[] DEFAULT ARRAY['aiden'],
  start_date DATE,
  end_date DATE,
  max_uses INT,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_coupons_brand_idx ON brand_coupons (brand_id);

ALTER TABLE brand_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON brand_coupons FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_active" ON brand_coupons FOR SELECT TO authenticated
  USING (is_active = true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_brand_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_coupons_updated_at
  BEFORE UPDATE ON brand_coupons
  FOR EACH ROW EXECUTE FUNCTION update_brand_coupons_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260405100000_phase2_brand_extensions.sql
git commit -m "feat: add Phase 2 brand extensions migration (slug, social_links, brand_coupons)"
```

---

### Task 2: loadFeeSchedules バグ修正（Phase 1持ち越し）

**Files:**
- Modify: `aiden-admin.html:397-406` (switchTab), `aiden-admin.html:433` (renderPage corp hook)

法人詳細ページの初期表示時にfeeタブが読み込まれないバグ。`switchTab`でのみ`loadFeeSchedules`が呼ばれ、初期ロード時にはスキップされる。

- [ ] **Step 1: renderPage内のcorp post-hookにfee自動ロード追加**

`aiden-admin.html:436`付近（`renderPage`関数の末尾のpost hooks）に法人ページ初期表示時のフィー自動ロードを追加:

```js
// 既存: if(v.type==='brand')initBrandTabs();
// 追加: 法人ページ初期表示時にfeeスケジュールをプリロード
if(v.type==='corp'){
  var c=CORPS.find(function(x){return x.id===v.id;});
  if(c)loadFeeSchedules(c._uuid,c.id);
}
```

これを `if(v.type==='brand')initBrandTabs();` の直後に追加する。

- [ ] **Step 2: ブラウザで動作確認**

法人詳細ページ→手数料設定タブをクリック→手数料一覧が表示されることを確認。
また、法人ページ初期表示後に手数料タブに切り替えても二重ロードで問題ないことを確認（`loadFeeSchedules`は冪等）。

- [ ] **Step 3: Commit**

```bash
git add aiden-admin.html
git commit -m "fix: auto-load fee schedules on corp page initial render"
```

---

### Task 3: loadAllData拡張 — brandsの追加カラム読み込み

**Files:**
- Modify: `aiden-admin.html:184-188` (BRANDS mapping in loadAllData)

現在のBRANDS mappingは`name, display_id, primary_color, pii_access_settings`のみ。Phase 2で追加したカラムを読み込む。

- [ ] **Step 1: BRANDS mapping拡張**

`aiden-admin.html:184-188`のBRANDSマッピングを以下に変更:

```js
BRANDS=(brandsRaw||[]).map(r=>({
  _uuid:r.id, id:r.display_id, corpId:r.corporations?.display_id||'',
  name:r.name, slug:r.slug||r.display_id||'', status:'active',
  mainColor:r.primary_color||'#6c5ce7',
  secondaryColor:r.secondary_color||'#1A1A1A',
  fontFamilies:r.font_families||['Noto Sans JP'],
  socialLinks:r.social_links||{},
  serviceSettings:r.service_settings||{},
  designSettings:r.design_settings||{},
  hpSettings:r.hp_settings||{},
  cancelPolicy:r.cancel_policy||{no_show:100,same_day:100,'3_days_before':50},
  pii_access_settings:r.pii_access_settings||{...PII_ACCESS_DEFAULTS}
}));
```

- [ ] **Step 2: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: load extended brand columns (slug, social_links, design, etc.)"
```

---

### Task 4: 基本情報タブ — DB永続化+複数フォント選択

**Files:**
- Modify: `aiden-admin.html:1406` (brand-basic tab HTML in renderBrandPage)
- Modify: `aiden-admin.html:1894-1905` (saveBrandBasic)

- [ ] **Step 1: 基本情報タブHTML更新**

`renderBrandPage`内の`brand-basic` div（line 1406）を更新。フォント選択を複数チェックボックスに変更、SNSリンクをDB値で初期化:

```js
// brand-basic tab content — replace the entire brand-basic div
'<div class="tab-content active" id="brand-basic"><div class="card"><div class="card-title">ブランド基本情報 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="saveBrandBasic(\''+b.id+'\')">保存</button></span></div><div class="form-grid"><div class="form-group"><label>ブランド名</label><input type="text" id="brandBasicName" value="'+escHtml(b.name)+'"></div><div class="form-group"><label>スラッグ</label><input type="text" id="brandBasicSlug" value="'+escHtml(b.slug)+'"></div><div class="form-group"><label>ID</label><input type="text" value="'+b.id+'" readonly style="background:#f5f6fa;color:var(--text-light)"></div><div class="form-group full"><label>フォント（複数選択可）</label><div style="display:flex;flex-wrap:wrap;gap:8px" id="brandFontChecks">'+
['Noto Sans JP','Noto Serif JP','M PLUS Rounded 1c','Zen Maru Gothic','Kosugi Maru'].map(f=>
  '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" value="'+f+'" '+(b.fontFamilies.includes(f)?'checked':'')+'>'+f+'</label>'
).join('')+'</div></div></div></div>'+
'<div class="card"><div class="card-title">SNSリンク <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="saveBrandSocialLinks(\''+b.id+'\')">保存</button></span></div><div class="form-grid"><div class="form-group"><label>Instagram</label><input type="url" id="brandSnsIg" value="'+escHtml(b.socialLinks.instagram||'')+'"></div><div class="form-group"><label>X</label><input type="url" id="brandSnsX" value="'+escHtml(b.socialLinks.x||'')+'"></div><div class="form-group"><label>LINE</label><input type="url" id="brandSnsLine" value="'+escHtml(b.socialLinks.line||'')+'"></div><div class="form-group"><label>TikTok</label><input type="url" id="brandSnsTiktok" value="'+escHtml(b.socialLinks.tiktok||'')+'"></div></div></div></div>'
```

- [ ] **Step 2: saveBrandBasic関数更新**

`saveBrandBasic`（line 1894）を更新し、フォント設定も含めてDB保存:

```js
async function saveBrandBasic(brandDisplayId){
  const b=BRANDS.find(x=>x.id===brandDisplayId);
  if(!b)return;
  const name=document.getElementById('brandBasicName')?.value.trim()||b.name;
  const slug=document.getElementById('brandBasicSlug')?.value.trim()||b.slug;
  const fontChecks=document.querySelectorAll('#brandFontChecks input[type="checkbox"]:checked');
  const fontFamilies=Array.from(fontChecks).map(c=>c.value);
  if(!fontFamilies.length){showToast('⚠️ フォントを1つ以上選択してください');return;}
  try{
    const {error}=await sb.from('brands').update({
      name:name, slug:slug, font_families:fontFamilies
    }).eq('id',b._uuid);
    if(error)throw error;
    b.name=name;b.slug=slug;b.fontFamilies=fontFamilies;
    logAudit('update_brand','brands',b._uuid,{name,slug,fontFamilies});
    showToast('✅ ブランド情報を保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: saveBrandSocialLinks関数を追加**

```js
async function saveBrandSocialLinks(brandDisplayId){
  const b=BRANDS.find(x=>x.id===brandDisplayId);
  if(!b)return;
  const socialLinks={
    instagram:document.getElementById('brandSnsIg')?.value.trim()||'',
    x:document.getElementById('brandSnsX')?.value.trim()||'',
    line:document.getElementById('brandSnsLine')?.value.trim()||'',
    tiktok:document.getElementById('brandSnsTiktok')?.value.trim()||''
  };
  try{
    const {error}=await sb.from('brands').update({social_links:socialLinks}).eq('id',b._uuid);
    if(error)throw error;
    b.socialLinks=socialLinks;
    logAudit('update_brand_social','brands',b._uuid,{socialLinks});
    showToast('✅ SNSリンクを保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand basic info & social links DB persistence with multi-font select"
```

---

### Task 5: サービス設定タブ — product_dev/new_store削除 + delivery_hub Coming Soon + DB保存

**Files:**
- Modify: `aiden-admin.html:126-137` (SERVICES constant)
- Modify: `aiden-admin.html:1407` (brand-services tab)

- [ ] **Step 1: SERVICES定数からproduct_dev/new_store削除、delivery_hubにComingSoon追加**

`SERVICES`配列（line 126）を更新:

```js
const SERVICES=[
  {key:'mo_dinein',name:'モバイルオーダー（店内注文）',icon:'🍽',cat:'モバイルオーダー',cost:'free',desc:'店内でのQR注文・決済'},
  {key:'mo_takeout',name:'モバイルオーダー（持ち帰り）',icon:'🥡',cat:'モバイルオーダー',cost:'free',desc:'テイクアウト事前注文・決済'},
  {key:'mo_delivery',name:'モバイルオーダー（デリバリー）',icon:'🛵',cat:'モバイルオーダー',cost:'free',desc:'自社デリバリー注文・決済'},
  {key:'delivery_hub',name:'デリバリープラットフォーム一元受注',icon:'📦',cat:'モバイルオーダー',cost:'free',desc:'UberEats/出前館等の一元管理',comingSoon:true},
  {key:'ai_std',name:'AI活用 スタンダード',icon:'🤖',cat:'AI活用',cost:'free',desc:'基本AI機能（SNS文生成・画像加工等）'},
  {key:'ai_pro',name:'AI活用 PRO',icon:'🤖',cat:'AI活用',cost:'paid',desc:'高度なAI分析・自動化機能を解放',comingSoon:true},
  {key:'ai_expert',name:'AI活用 EXPERT',icon:'🤖',cat:'AI活用',cost:'paid',desc:'カスタムAIモデル・API連携',comingSoon:true},
  {key:'crm_std',name:'CRM スタンダード',icon:'📧',cat:'CRM',cost:'free',desc:'基本CRM機能（メール配信等）'},
  {key:'crm_pro',name:'CRM PRO',icon:'📧',cat:'CRM',cost:'paid',desc:'高度なセグメント・自動配信',comingSoon:true},
  {key:'crm_expert',name:'CRM EXPERT',icon:'📧',cat:'CRM',cost:'paid',desc:'カスタムCRM・LINE/アプリ連携',comingSoon:true},
];
```

- [ ] **Step 2: renderServiceCards更新 — comingSoonハンドリング**

`renderServiceCards`（line 1658）にcomingSoonの処理を追加:

```js
function renderServiceCards(entityId, level, parentId){
  return SERVICES.map(s=>{
    const isOn=getSvc(entityId,s.key);
    let locked=false, lockMsg='';
    if(s.comingSoon){locked=true;lockMsg='Coming Soon';}
    else if(level==='brand'&&parentId&&!getSvc(parentId,s.key)){locked=true;lockMsg='法人でOFFのため選択不可';}
    else if(level==='store'&&parentId&&!getSvc(parentId,s.key)){locked=true;lockMsg='ブランドでOFFのため選択不可';}
    const cls='svc-card'+(isOn&&!s.comingSoon?' enabled':'')+(locked?' locked':'');
    const costTag=s.cost==='free'?'<span class="svc-tag free">無料</span>':'<span class="svc-tag paid">追加課金</span>';
    const comingSoonBadge=s.comingSoon?'<span style="font-size:9px;background:#dfe6e9;color:#636e72;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:4px">Coming Soon</span>':'';
    return '<div class="'+cls+'" style="'+(s.comingSoon?'opacity:0.45;pointer-events:none':'')+'">'+
      '<div class="svc-head"><div class="svc-icon">'+s.icon+'</div><div class="svc-name">'+s.name+comingSoonBadge+'</div>'+costTag+'</div>'+
      '<div class="svc-desc">'+s.desc+'</div>'+
      '<div class="svc-toggle"><span class="svc-status '+(isOn&&!s.comingSoon?'on':'off')+'">'+(isOn&&!s.comingSoon?'✅ 利用中':'OFF')+'</span>'+
      '<label class="toggle-sw"><input type="checkbox"'+(isOn&&!s.comingSoon?' checked':'')+(s.comingSoon?' disabled':'')+' onchange="toggleSvc(\''+entityId+'\',\''+s.key+'\',\''+level+'\')"><span class="slider"'+(s.comingSoon?' style="cursor:not-allowed"':'')+'></span></label></div>'+
      (locked&&!s.comingSoon?'<div class="svc-lock">🔒 '+lockMsg+'</div>':'')+
      '</div>';
  }).join('');
}
```

- [ ] **Step 3: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: remove product_dev/new_store services, add Coming Soon badge for delivery_hub/paid tiers"
```

---

### Task 6: デザインタブ — DB永続化

**Files:**
- Modify: `aiden-admin.html:1408` (brand-design tab HTML)

- [ ] **Step 1: デザインタブHTML更新**

`renderBrandPage`内の`brand-design` div（line 1408）を更新:

```js
'<div class="tab-content" id="brand-design"><div class="card"><div class="card-title">デザイン設定 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="saveBrandDesign(\''+b.id+'\')">保存</button></span></div><div class="form-grid"><div class="form-group"><label>メインカラー</label><div style="display:flex;gap:8px;align-items:center"><input type="color" id="brandDesignMainColor" value="'+b.mainColor+'" style="width:40px;height:36px;border:none;cursor:pointer"><input type="text" id="brandDesignMainColorText" value="'+b.mainColor+'" style="width:100px;font-family:monospace;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:12px" oninput="document.getElementById(\'brandDesignMainColor\').value=this.value"></div></div><div class="form-group"><label>サブカラー</label><div style="display:flex;gap:8px;align-items:center"><input type="color" id="brandDesignSubColor" value="'+b.secondaryColor+'" style="width:40px;height:36px;border:none;cursor:pointer"><input type="text" id="brandDesignSubColorText" value="'+b.secondaryColor+'" style="width:100px;font-family:monospace;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:12px" oninput="document.getElementById(\'brandDesignSubColor\').value=this.value"></div></div><div class="form-group"><label>ヘッダー文字色</label><div style="display:flex;gap:8px;align-items:center"><input type="color" id="brandDesignHeaderText" value="'+(b.designSettings.headerTextColor||'#FFFFFF')+'" style="width:40px;height:36px;border:none;cursor:pointer"><input type="text" id="brandDesignHeaderTextVal" value="'+(b.designSettings.headerTextColor||'#FFFFFF')+'" style="width:100px;font-family:monospace;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:12px" oninput="document.getElementById(\'brandDesignHeaderText\').value=this.value"></div></div></div></div><div class="card"><div class="card-title">ロゴ</div><div style="border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;color:var(--text-light);font-size:12px;opacity:0.5;pointer-events:none">📎 ドラッグ&ドロップ <span style="font-size:9px;background:#dfe6e9;color:#636e72;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:8px">Coming Soon</span></div></div></div>'
```

- [ ] **Step 2: saveBrandDesign関数追加**

```js
async function saveBrandDesign(brandDisplayId){
  const b=BRANDS.find(x=>x.id===brandDisplayId);
  if(!b)return;
  const mainColor=document.getElementById('brandDesignMainColor')?.value||b.mainColor;
  const subColor=document.getElementById('brandDesignSubColor')?.value||b.secondaryColor;
  const headerTextColor=document.getElementById('brandDesignHeaderText')?.value||'#FFFFFF';
  const designSettings={...b.designSettings,headerTextColor:headerTextColor};
  try{
    const {error}=await sb.from('brands').update({
      primary_color:mainColor, secondary_color:subColor, design_settings:designSettings
    }).eq('id',b._uuid);
    if(error)throw error;
    b.mainColor=mainColor;b.secondaryColor=subColor;b.designSettings=designSettings;
    logAudit('update_brand_design','brands',b._uuid,{mainColor,subColor});
    showToast('✅ デザイン設定を保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand design tab DB persistence (colors, header text)"
```

---

### Task 7: HP設定タブ — DB永続化 + ヒーローバナーCRUD

**Files:**
- Modify: `aiden-admin.html:1409` (brand-hp tab HTML)

- [ ] **Step 1: HP設定タブHTML更新**

`renderBrandPage`内の`brand-hp` div（line 1409）を更新。OGP/メタディスクリプション/ファビコン設定を追加し、ヒーローバナーをDB連携:

```js
'<div class="tab-content" id="brand-hp"><div class="card"><div class="card-title">HP公開設定 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="saveBrandHpSettings(\''+b.id+'\')">保存</button></span></div><div class="form-grid"><div class="form-group"><label>公開URL</label><input type="text" value="https://aiden-jp.net/'+escHtml(b.slug)+'" readonly style="background:#f5f6fa;color:var(--text-light)"></div><div class="form-group"><label>ステータス</label><select id="brandHpStatus"><option value="published"'+((b.hpSettings.status||'published')==='published'?' selected':'')+'>公開中</option><option value="draft"'+((b.hpSettings.status)==='draft'?' selected':'')+'>非公開</option></select></div><div class="form-group full"><label>メタディスクリプション</label><textarea id="brandHpMetaDesc" rows="2" style="font-size:12px" placeholder="検索エンジンに表示される説明文（120文字程度）">'+(b.hpSettings.metaDescription||'')+'</textarea></div><div class="form-group"><label>OGP画像URL</label><input type="url" id="brandHpOgImage" value="'+(b.hpSettings.ogImage||'')+'" placeholder="https://..."></div><div class="form-group"><label>ファビコンURL</label><input type="url" id="brandHpFavicon" value="'+(b.hpSettings.favicon||'')+'" placeholder="https://..."></div></div></div>'+
'<div class="card" style="margin-top:16px"><div class="card-title">カスタムドメイン</div><div style="font-size:12px;color:var(--text-light);margin-bottom:8px">ブランド専用ドメインを設定（URLに「aiden」が表示されなくなります）</div><div class="form-grid"><div class="form-group"><label>ドメイン名</label><input type="text" id="brandHpDomain" value="'+(b.hpSettings.customDomain||'')+'" placeholder="例: www.example.com" style="font-size:13px"></div></div><div style="font-size:11px;color:var(--text-light);margin-top:4px">※ドメインのDNS設定とVercelのカスタムドメイン追加が別途必要です</div></div>'+
'<div class="card" style="margin-top:16px"><div class="card-title">ヒーローバナー（カルーセル） <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddHeroSlideModal(\''+b._uuid+'\',\''+b.id+'\')">＋ 追加</button></span></div><div id="heroSlidesList-'+b.id+'"><div style="color:#888;text-align:center;padding:20px">読み込み中...</div></div></div></div>'
```

- [ ] **Step 2: saveBrandHpSettings関数追加**

```js
async function saveBrandHpSettings(brandDisplayId){
  const b=BRANDS.find(x=>x.id===brandDisplayId);
  if(!b)return;
  const hpSettings={
    status:document.getElementById('brandHpStatus')?.value||'published',
    metaDescription:document.getElementById('brandHpMetaDesc')?.value.trim()||'',
    ogImage:document.getElementById('brandHpOgImage')?.value.trim()||'',
    favicon:document.getElementById('brandHpFavicon')?.value.trim()||'',
    customDomain:document.getElementById('brandHpDomain')?.value.trim()||''
  };
  try{
    const {error}=await sb.from('brands').update({hp_settings:hpSettings}).eq('id',b._uuid);
    if(error)throw error;
    b.hpSettings=hpSettings;
    logAudit('update_brand_hp','brands',b._uuid,{hpSettings});
    showToast('✅ HP設定を保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: ヒーローバナーCRUD関数追加**

```js
async function loadHeroSlides(brandUuid,brandDisplayId){
  var el=document.getElementById('heroSlidesList-'+brandDisplayId);
  if(!el)return;
  try{
    var {data:slides,error}=await sb.from('brand_hero_slides').select('*').eq('brand_id',brandUuid).order('sort_order');
    if(error)throw error;
    if(!slides||!slides.length){el.innerHTML='<div class="empty-state">バナーが登録されていません</div>';return;}
    el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:12px">'+slides.map(s=>
      '<div style="position:relative;width:180px;aspect-ratio:16/9;background:#f5f6fa;border:1px solid var(--border);border-radius:6px;overflow:hidden">'+
      '<img src="'+escHtml(s.media_url)+'" alt="'+escHtml(s.alt_text||'')+'" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">'+
      '<div style="position:absolute;top:4px;right:4px;display:flex;gap:2px">'+
      '<button class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:10px" onclick="deleteHeroSlide(\''+s.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">✕</button></div></div>'
    ).join('')+'</div>';
  }catch(e){el.innerHTML='<div style="color:var(--danger)">読み込みエラー</div>';}
}

function openAddHeroSlideModal(brandUuid,brandDisplayId){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>🖼 ヒーローバナー追加</h3>'+
  '<div class="form-grid">'+
    '<div class="form-group full"><label>画像URL <span style="color:var(--danger)">*</span></label><input type="url" id="heroSlideUrl" placeholder="https://..."></div>'+
    '<div class="form-group"><label>代替テキスト</label><input type="text" id="heroSlideAlt" placeholder="バナーの説明"></div>'+
    '<div class="form-group"><label>表示順</label><input type="number" id="heroSlideOrder" value="0" min="0"></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveHeroSlide(\''+brandUuid+'\',\''+brandDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}

async function saveHeroSlide(brandUuid,brandDisplayId){
  var url=document.getElementById('heroSlideUrl')?.value.trim();
  if(!url){showToast('⚠️ 画像URLは必須です');return;}
  var alt=document.getElementById('heroSlideAlt')?.value.trim()||'';
  var order=parseInt(document.getElementById('heroSlideOrder')?.value)||0;
  try{
    var {error}=await sb.from('brand_hero_slides').insert({brand_id:brandUuid,media_url:url,alt_text:alt,sort_order:order});
    if(error)throw error;
    logAudit('add_hero_slide','brand_hero_slides',null,{brandId:brandDisplayId,url});
    closeModal();showToast('✅ バナーを追加しました');
    loadHeroSlides(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteHeroSlide(slideId,brandUuid,brandDisplayId){
  if(!confirm('このバナーを削除しますか？'))return;
  try{
    var {error}=await sb.from('brand_hero_slides').delete().eq('id',slideId);
    if(error)throw error;
    logAudit('delete_hero_slide','brand_hero_slides',slideId,{});
    showToast('✅ バナーを削除しました');
    loadHeroSlides(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: initBrandTabs更新 — ヒーローバナー自動ロード**

`initBrandTabs`（line 1421）を更新:

```js
function initBrandTabs(){
  brandMenuCat='all';renderBrandMenu();
  var b=BRANDS.find(x=>x.id===currentView.id);
  if(b)loadHeroSlides(b._uuid,b.id);
}
```

- [ ] **Step 5: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand HP settings DB persistence + hero banner CRUD"
```

---

### Task 8: ニュースタブ — DB連携CRUD

**Files:**
- Modify: `aiden-admin.html:1410` (brand-news tab HTML)

- [ ] **Step 1: ニュースタブHTML更新**

`renderBrandPage`内の`brand-news` div（line 1410）を更新:

```js
'<div class="tab-content" id="brand-news"><div class="card"><div class="card-title">ニュース管理 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddNewsModal(\''+b._uuid+'\',\''+b.id+'\')">＋ 追加</button></span></div><div id="brandNewsList-'+b.id+'"><div style="color:#888;text-align:center;padding:20px">読み込み中...</div></div></div></div>'
```

- [ ] **Step 2: ニュースCRUD関数追加**

```js
async function loadBrandNews(brandUuid,brandDisplayId){
  var el=document.getElementById('brandNewsList-'+brandDisplayId);
  if(!el)return;
  try{
    var {data:news,error}=await sb.from('brand_news').select('*').eq('brand_id',brandUuid).order('published_at',{ascending:false});
    if(error)throw error;
    if(!news||!news.length){el.innerHTML='<div class="empty-state">ニュースがありません</div>';return;}
    var catLabels={info:'お店情報',menu:'メニュー',event:'イベント',news:'ニュース'};
    el.innerHTML='<table class="data-table"><thead><tr><th>日付</th><th>カテゴリ</th><th>タイトル</th><th>本文</th><th>ステータス</th><th></th></tr></thead><tbody>'+
    news.map(n=>{
      var catLabel=catLabels[n.category]||n.category||'—';
      var bodyStatus=n.body_html?'<span style="font-size:11px;color:#00b894">入力済み</span>':'<span style="font-size:11px;color:var(--text-light)">未入力</span>';
      var statusBg=n.status==='published'?'background:#e6f9f0;color:#00b894':'background:#dfe6e9;color:#636e72';
      var statusLabel=n.status==='published'?'公開':'下書き';
      return '<tr><td>'+(n.published_at||'—')+'</td><td>'+escHtml(catLabel)+'</td><td style="font-weight:600">'+escHtml(n.title)+'</td><td>'+bodyStatus+'</td><td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;'+statusBg+'">'+statusLabel+'</span></td><td><button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="openEditNewsModal(\''+n.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteBrandNews(\''+n.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">削除</button></td></tr>';
    }).join('')+'</tbody></table>'+
    '<div style="font-size:11px;color:var(--text-light);margin-top:8px">記事本文はMarkdown記法で入力できます。</div>';
  }catch(e){el.innerHTML='<div style="color:var(--danger)">読み込みエラー: '+escHtml(e.message)+'</div>';}
}

function openAddNewsModal(brandUuid,brandDisplayId){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>📰 ニュース追加</h3>'+
  '<div class="form-grid">'+
    '<div class="form-group"><label>タイトル <span style="color:var(--danger)">*</span></label><input type="text" id="newsTitle" placeholder="ニュースのタイトル"></div>'+
    '<div class="form-group"><label>カテゴリ</label><select id="newsCat"><option value="news">ニュース</option><option value="info">お店情報</option><option value="menu">メニュー</option><option value="event">イベント</option></select></div>'+
    '<div class="form-group"><label>公開日</label><input type="date" id="newsDate" value="'+new Date().toISOString().split('T')[0]+'"></div>'+
    '<div class="form-group"><label>ステータス</label><select id="newsStatus"><option value="published">公開</option><option value="draft">下書き</option></select></div>'+
    '<div class="form-group full"><label>画像URL</label><input type="url" id="newsUrl" placeholder="https://..."></div>'+
    '<div class="form-group full"><label>本文（Markdown対応）</label><textarea id="newsBody" rows="6" style="font-size:12px;font-family:monospace" placeholder="記事の本文をMarkdownで入力..."></textarea></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveBrandNews(\''+brandUuid+'\',\''+brandDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}

async function saveBrandNews(brandUuid,brandDisplayId){
  var title=document.getElementById('newsTitle')?.value.trim();
  if(!title){showToast('⚠️ タイトルは必須です');return;}
  var cat=document.getElementById('newsCat')?.value||'news';
  var date=document.getElementById('newsDate')?.value||new Date().toISOString().split('T')[0];
  var status=document.getElementById('newsStatus')?.value||'published';
  var url=document.getElementById('newsUrl')?.value.trim()||null;
  var body=document.getElementById('newsBody')?.value.trim()||null;
  try{
    var {error}=await sb.from('brand_news').insert({brand_id:brandUuid,title:title,category:cat,published_at:date,status:status,url:url,body_html:body});
    if(error)throw error;
    logAudit('add_news','brand_news',null,{brandId:brandDisplayId,title});
    closeModal();showToast('✅ ニュースを追加しました');
    loadBrandNews(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

function openEditNewsModal(newsId,brandUuid,brandDisplayId){
  sb.from('brand_news').select('*').eq('id',newsId).single().then(function(res){
    var n=res.data;
    if(res.error||!n){showToast('⚠️ データ取得エラー');return;}
    openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>📰 ニュース編集</h3>'+
    '<div class="form-grid">'+
      '<div class="form-group"><label>タイトル <span style="color:var(--danger)">*</span></label><input type="text" id="editNewsTitle" value="'+escHtml(n.title)+'"></div>'+
      '<div class="form-group"><label>カテゴリ</label><select id="editNewsCat"><option value="news"'+(n.category==='news'?' selected':'')+'>ニュース</option><option value="info"'+(n.category==='info'?' selected':'')+'>お店情報</option><option value="menu"'+(n.category==='menu'?' selected':'')+'>メニュー</option><option value="event"'+(n.category==='event'?' selected':'')+'>イベント</option></select></div>'+
      '<div class="form-group"><label>公開日</label><input type="date" id="editNewsDate" value="'+(n.published_at||'')+'"></div>'+
      '<div class="form-group"><label>ステータス</label><select id="editNewsStatus"><option value="published"'+(n.status==='published'?' selected':'')+'>公開</option><option value="draft"'+(n.status!=='published'?' selected':'')+'>下書き</option></select></div>'+
      '<div class="form-group full"><label>画像URL</label><input type="url" id="editNewsUrl" value="'+escHtml(n.url||'')+'"></div>'+
      '<div class="form-group full"><label>本文（Markdown対応）</label><textarea id="editNewsBody" rows="6" style="font-size:12px;font-family:monospace">'+escHtml(n.body_html||'')+'</textarea></div>'+
    '</div>'+
    '<div class="btn-group"><button class="btn btn-primary" onclick="updateBrandNews(\''+newsId+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">保存</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  });
}

async function updateBrandNews(newsId,brandUuid,brandDisplayId){
  var title=document.getElementById('editNewsTitle')?.value.trim();
  if(!title){showToast('⚠️ タイトルは必須です');return;}
  try{
    var {error}=await sb.from('brand_news').update({
      title:title,
      category:document.getElementById('editNewsCat')?.value||'news',
      published_at:document.getElementById('editNewsDate')?.value||null,
      status:document.getElementById('editNewsStatus')?.value||'published',
      url:document.getElementById('editNewsUrl')?.value.trim()||null,
      body_html:document.getElementById('editNewsBody')?.value.trim()||null
    }).eq('id',newsId);
    if(error)throw error;
    logAudit('update_news','brand_news',newsId,{title});
    closeModal();showToast('✅ ニュースを更新しました');
    loadBrandNews(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteBrandNews(newsId,brandUuid,brandDisplayId){
  if(!confirm('このニュースを削除しますか？'))return;
  try{
    var {error}=await sb.from('brand_news').delete().eq('id',newsId);
    if(error)throw error;
    logAudit('delete_news','brand_news',newsId,{});
    showToast('✅ ニュースを削除しました');
    loadBrandNews(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: initBrandTabsにニュース自動ロード追加**

```js
function initBrandTabs(){
  brandMenuCat='all';renderBrandMenu();
  var b=BRANDS.find(x=>x.id===currentView.id);
  if(b){
    loadHeroSlides(b._uuid,b.id);
    loadBrandNews(b._uuid,b.id);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand news tab full CRUD with DB persistence"
```

---

### Task 9: キャンペーンタブ — DB連携CRUD

**Files:**
- Modify: `aiden-admin.html:1411` (brand-campaign tab HTML)

- [ ] **Step 1: キャンペーンタブHTML更新**

```js
'<div class="tab-content" id="brand-campaign"><div class="card"><div class="card-title">キャンペーン管理 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddCampaignModal(\''+b._uuid+'\',\''+b.id+'\')">＋ 追加</button></span></div><div id="brandCampaignList-'+b.id+'"><div style="color:#888;text-align:center;padding:20px">読み込み中...</div></div></div></div>'
```

- [ ] **Step 2: キャンペーンCRUD関数追加**

```js
async function loadBrandCampaigns(brandUuid,brandDisplayId){
  var el=document.getElementById('brandCampaignList-'+brandDisplayId);
  if(!el)return;
  try{
    var {data:camps,error}=await sb.from('brand_campaigns').select('*').eq('brand_id',brandUuid).order('start_date',{ascending:false});
    if(error)throw error;
    if(!camps||!camps.length){el.innerHTML='<div class="empty-state">キャンペーンがありません</div>';return;}
    var today=new Date().toISOString().slice(0,10);
    el.innerHTML='<table class="data-table"><thead><tr><th>タイトル</th><th>画像/動画</th><th>期間</th><th>ステータス</th><th></th></tr></thead><tbody>'+
    camps.map(c=>{
      var mediaText=c.media_url?'<span style="color:var(--text-light);font-size:11px">'+(c.media_type==='video'?'動画':'画像')+'あり</span>':'<span style="color:var(--text-light);font-size:11px">未設定</span>';
      var period=(c.start_date||'—')+' 〜 '+(c.end_date||'—');
      var statusLabel,statusStyle;
      if(!c.is_active){statusLabel='非公開';statusStyle='background:#dfe6e9;color:#636e72';}
      else if(c.start_date&&c.start_date>today){statusLabel='予約';statusStyle='background:#FFF3E0;color:#E65100';}
      else if(c.end_date&&c.end_date<today){statusLabel='終了';statusStyle='background:#dfe6e9;color:#636e72';}
      else{statusLabel='公開中';statusStyle='background:#e6f9f0;color:#00b894';}
      return '<tr><td style="font-weight:600">'+escHtml(c.title)+'</td><td>'+mediaText+'</td><td>'+period+'</td><td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;'+statusStyle+'">'+statusLabel+'</span></td><td><button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="openEditCampaignModal(\''+c.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteBrandCampaign(\''+c.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">削除</button></td></tr>';
    }).join('')+'</tbody></table>';
  }catch(e){el.innerHTML='<div style="color:var(--danger)">読み込みエラー: '+escHtml(e.message)+'</div>';}
}

function openAddCampaignModal(brandUuid,brandDisplayId){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>📢 キャンペーン追加</h3>'+
  '<div class="form-grid">'+
    '<div class="form-group full"><label>タイトル <span style="color:var(--danger)">*</span></label><input type="text" id="campTitle" placeholder="キャンペーン名"></div>'+
    '<div class="form-group full"><label>説明</label><textarea id="campDesc" rows="3" style="font-size:12px" placeholder="キャンペーンの説明..."></textarea></div>'+
    '<div class="form-group"><label>画像/動画URL</label><input type="url" id="campMediaUrl" placeholder="https://..."></div>'+
    '<div class="form-group"><label>メディア種別</label><select id="campMediaType"><option value="image">画像</option><option value="video">動画</option></select></div>'+
    '<div class="form-group"><label>リンクURL</label><input type="url" id="campLinkUrl" placeholder="https://..."></div>'+
    '<div class="form-group"><label>開始日</label><input type="date" id="campStart"></div>'+
    '<div class="form-group"><label>終了日</label><input type="date" id="campEnd"></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveBrandCampaign(\''+brandUuid+'\',\''+brandDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}

async function saveBrandCampaign(brandUuid,brandDisplayId){
  var title=document.getElementById('campTitle')?.value.trim();
  if(!title){showToast('⚠️ タイトルは必須です');return;}
  try{
    var {error}=await sb.from('brand_campaigns').insert({
      brand_id:brandUuid,title:title,
      description:document.getElementById('campDesc')?.value.trim()||null,
      media_url:document.getElementById('campMediaUrl')?.value.trim()||null,
      media_type:document.getElementById('campMediaType')?.value||'image',
      link_url:document.getElementById('campLinkUrl')?.value.trim()||null,
      start_date:document.getElementById('campStart')?.value||null,
      end_date:document.getElementById('campEnd')?.value||null
    });
    if(error)throw error;
    logAudit('add_campaign','brand_campaigns',null,{brandId:brandDisplayId,title});
    closeModal();showToast('✅ キャンペーンを追加しました');
    loadBrandCampaigns(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

function openEditCampaignModal(campId,brandUuid,brandDisplayId){
  sb.from('brand_campaigns').select('*').eq('id',campId).single().then(function(res){
    var c=res.data;
    if(res.error||!c){showToast('⚠️ データ取得エラー');return;}
    openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>📢 キャンペーン編集</h3>'+
    '<div class="form-grid">'+
      '<div class="form-group full"><label>タイトル <span style="color:var(--danger)">*</span></label><input type="text" id="editCampTitle" value="'+escHtml(c.title)+'"></div>'+
      '<div class="form-group full"><label>説明</label><textarea id="editCampDesc" rows="3" style="font-size:12px">'+escHtml(c.description||'')+'</textarea></div>'+
      '<div class="form-group"><label>画像/動画URL</label><input type="url" id="editCampMediaUrl" value="'+escHtml(c.media_url||'')+'"></div>'+
      '<div class="form-group"><label>メディア種別</label><select id="editCampMediaType"><option value="image"'+(c.media_type!=='video'?' selected':'')+'>画像</option><option value="video"'+(c.media_type==='video'?' selected':'')+'>動画</option></select></div>'+
      '<div class="form-group"><label>リンクURL</label><input type="url" id="editCampLinkUrl" value="'+escHtml(c.link_url||'')+'"></div>'+
      '<div class="form-group"><label>開始日</label><input type="date" id="editCampStart" value="'+(c.start_date||'')+'"></div>'+
      '<div class="form-group"><label>終了日</label><input type="date" id="editCampEnd" value="'+(c.end_date||'')+'"></div>'+
      '<div class="form-group"><label>公開</label><select id="editCampActive"><option value="true"'+(c.is_active?' selected':'')+'>公開</option><option value="false"'+(!c.is_active?' selected':'')+'>非公開</option></select></div>'+
    '</div>'+
    '<div class="btn-group"><button class="btn btn-primary" onclick="updateBrandCampaign(\''+campId+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">保存</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  });
}

async function updateBrandCampaign(campId,brandUuid,brandDisplayId){
  var title=document.getElementById('editCampTitle')?.value.trim();
  if(!title){showToast('⚠️ タイトルは必須です');return;}
  try{
    var {error}=await sb.from('brand_campaigns').update({
      title:title,
      description:document.getElementById('editCampDesc')?.value.trim()||null,
      media_url:document.getElementById('editCampMediaUrl')?.value.trim()||null,
      media_type:document.getElementById('editCampMediaType')?.value||'image',
      link_url:document.getElementById('editCampLinkUrl')?.value.trim()||null,
      start_date:document.getElementById('editCampStart')?.value||null,
      end_date:document.getElementById('editCampEnd')?.value||null,
      is_active:document.getElementById('editCampActive')?.value==='true'
    }).eq('id',campId);
    if(error)throw error;
    logAudit('update_campaign','brand_campaigns',campId,{title});
    closeModal();showToast('✅ キャンペーンを更新しました');
    loadBrandCampaigns(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteBrandCampaign(campId,brandUuid,brandDisplayId){
  if(!confirm('このキャンペーンを削除しますか？'))return;
  try{
    var {error}=await sb.from('brand_campaigns').delete().eq('id',campId);
    if(error)throw error;
    logAudit('delete_campaign','brand_campaigns',campId,{});
    showToast('✅ キャンペーンを削除しました');
    loadBrandCampaigns(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: initBrandTabsにキャンペーン自動ロード追加**

```js
function initBrandTabs(){
  brandMenuCat='all';renderBrandMenu();
  var b=BRANDS.find(x=>x.id===currentView.id);
  if(b){
    loadHeroSlides(b._uuid,b.id);
    loadBrandNews(b._uuid,b.id);
    loadBrandCampaigns(b._uuid,b.id);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand campaign tab full CRUD with DB persistence"
```

---

### Task 10: クーポンタブ — DB連携CRUD

**Files:**
- Modify: `aiden-admin.html:1412` (brand-coupon tab HTML)

- [ ] **Step 1: クーポンタブHTML更新**

```js
'<div class="tab-content" id="brand-coupon"><div class="card"><div class="card-title">クーポン管理 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddCouponModal(\''+b._uuid+'\',\''+b.id+'\')">＋ 追加</button></span></div><div id="brandCouponList-'+b.id+'"><div style="color:#888;text-align:center;padding:20px">読み込み中...</div></div></div></div>'
```

- [ ] **Step 2: クーポンCRUD関数追加**

```js
async function loadBrandCoupons(brandUuid,brandDisplayId){
  var el=document.getElementById('brandCouponList-'+brandDisplayId);
  if(!el)return;
  try{
    var {data:coupons,error}=await sb.from('brand_coupons').select('*').eq('brand_id',brandUuid).order('created_at',{ascending:false});
    if(error)throw error;
    if(!coupons||!coupons.length){el.innerHTML='<div class="empty-state">クーポンがありません</div>';return;}
    var svcLabels={dinein:'店内',takeout:'持帰',delivery:'配達'};
    var platLabels={aiden:'AIden',uber_eats:'UE',demaecan:'出前館',menu:'menu',rakuten:'楽天'};
    el.innerHTML='<table class="data-table"><thead><tr><th>コード</th><th>名前</th><th class="r">割引</th><th>対象サービス</th><th>対象媒体</th><th>期間</th><th></th></tr></thead><tbody>'+
    coupons.map(c=>{
      var discountText=c.discount_type==='percent'?c.discount_value+'%':'¥'+Number(c.discount_value).toLocaleString();
      var svcs=(c.target_services||[]).map(s=>svcLabels[s]||s).join('/');
      var plats=(c.target_platforms||[]).map(p=>platLabels[p]||p).join('/');
      var period=(c.start_date||'—')+' 〜 '+(c.end_date||'—');
      return '<tr><td><code>'+escHtml(c.code)+'</code></td><td style="font-weight:600">'+escHtml(c.name)+'</td><td class="r fw-800">'+discountText+'</td><td style="font-size:11px">'+svcs+'</td><td style="font-size:11px">'+plats+'</td><td style="font-size:11px">'+period+'</td><td><button class="btn btn-secondary btn-sm" style="margin-right:4px" onclick="openEditCouponModal(\''+c.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteBrandCoupon(\''+c.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">削除</button></td></tr>';
    }).join('')+'</tbody></table>';
  }catch(e){el.innerHTML='<div style="color:var(--danger)">読み込みエラー: '+escHtml(e.message)+'</div>';}
}

function couponFormFields(prefix,c){
  c=c||{};
  var svcChecks=['dinein','takeout','delivery'].map(s=>'<label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" id="'+prefix+'CouponSvc_'+s+'" value="'+s+'" '+((c.target_services||['dinein','takeout','delivery']).includes(s)?'checked':'')+'>'+({dinein:'店内注文',takeout:'持ち帰り',delivery:'デリバリー'}[s])+'</label>').join('');
  var platChecks=['aiden','uber_eats','demaecan','menu','rakuten'].map(p=>'<label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" id="'+prefix+'CouponPlat_'+p+'" value="'+p+'" '+((c.target_platforms||['aiden']).includes(p)?'checked':'')+'>'+({aiden:'AIden',uber_eats:'UberEats',demaecan:'出前館',menu:'menu',rakuten:'楽天'}[p])+'</label>').join('');
  return '<div class="form-group"><label>コード <span style="color:var(--danger)">*</span></label><input type="text" id="'+prefix+'CouponCode" value="'+escHtml(c.code||'')+'" placeholder="WELCOME10"></div>'+
    '<div class="form-group"><label>名前 <span style="color:var(--danger)">*</span></label><input type="text" id="'+prefix+'CouponName" value="'+escHtml(c.name||'')+'" placeholder="初回10%OFF"></div>'+
    '<div class="form-group"><label>割引種別</label><select id="'+prefix+'CouponType"><option value="percent"'+((c.discount_type||'percent')==='percent'?' selected':'')+'>%割引</option><option value="fixed"'+(c.discount_type==='fixed'?' selected':'')+'>定額割引（円）</option></select></div>'+
    '<div class="form-group"><label>割引値</label><input type="number" id="'+prefix+'CouponValue" value="'+(c.discount_value||10)+'" min="0"></div>'+
    '<div class="form-group"><label>開始日</label><input type="date" id="'+prefix+'CouponStart" value="'+(c.start_date||'')+'"></div>'+
    '<div class="form-group"><label>終了日</label><input type="date" id="'+prefix+'CouponEnd" value="'+(c.end_date||'')+'"></div>'+
    '<div class="form-group full"><label>対象サービス</label><div style="display:flex;gap:12px;flex-wrap:wrap">'+svcChecks+'</div></div>'+
    '<div class="form-group full"><label>対象媒体</label><div style="display:flex;gap:12px;flex-wrap:wrap">'+platChecks+'</div></div>';
}

function getCouponFormData(prefix){
  var svcs=['dinein','takeout','delivery'].filter(s=>document.getElementById(prefix+'CouponSvc_'+s)?.checked);
  var plats=['aiden','uber_eats','demaecan','menu','rakuten'].filter(p=>document.getElementById(prefix+'CouponPlat_'+p)?.checked);
  return {
    code:document.getElementById(prefix+'CouponCode')?.value.trim(),
    name:document.getElementById(prefix+'CouponName')?.value.trim(),
    discount_type:document.getElementById(prefix+'CouponType')?.value||'percent',
    discount_value:parseFloat(document.getElementById(prefix+'CouponValue')?.value)||0,
    start_date:document.getElementById(prefix+'CouponStart')?.value||null,
    end_date:document.getElementById(prefix+'CouponEnd')?.value||null,
    target_services:svcs,
    target_platforms:plats
  };
}

function openAddCouponModal(brandUuid,brandDisplayId){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>🎟 クーポン追加</h3>'+
  '<div class="form-grid">'+couponFormFields('add',{})+'</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveBrandCoupon(\''+brandUuid+'\',\''+brandDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}

async function saveBrandCoupon(brandUuid,brandDisplayId){
  var d=getCouponFormData('add');
  if(!d.code||!d.name){showToast('⚠️ コードと名前は必須です');return;}
  try{
    var {error}=await sb.from('brand_coupons').insert({brand_id:brandUuid,...d});
    if(error)throw error;
    logAudit('add_coupon','brand_coupons',null,{brandId:brandDisplayId,code:d.code});
    closeModal();showToast('✅ クーポンを追加しました');
    loadBrandCoupons(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

function openEditCouponModal(couponId,brandUuid,brandDisplayId){
  sb.from('brand_coupons').select('*').eq('id',couponId).single().then(function(res){
    var c=res.data;
    if(res.error||!c){showToast('⚠️ データ取得エラー');return;}
    openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>🎟 クーポン編集</h3>'+
    '<div class="form-grid">'+couponFormFields('edit',c)+'</div>'+
    '<div class="btn-group"><button class="btn btn-primary" onclick="updateBrandCoupon(\''+couponId+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">保存</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  });
}

async function updateBrandCoupon(couponId,brandUuid,brandDisplayId){
  var d=getCouponFormData('edit');
  if(!d.code||!d.name){showToast('⚠️ コードと名前は必須です');return;}
  try{
    var {error}=await sb.from('brand_coupons').update(d).eq('id',couponId);
    if(error)throw error;
    logAudit('update_coupon','brand_coupons',couponId,{code:d.code});
    closeModal();showToast('✅ クーポンを更新しました');
    loadBrandCoupons(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteBrandCoupon(couponId,brandUuid,brandDisplayId){
  if(!confirm('このクーポンを削除しますか？'))return;
  try{
    var {error}=await sb.from('brand_coupons').delete().eq('id',couponId);
    if(error)throw error;
    logAudit('delete_coupon','brand_coupons',couponId,{});
    showToast('✅ クーポンを削除しました');
    loadBrandCoupons(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 3: initBrandTabsにクーポン自動ロード追加**

```js
function initBrandTabs(){
  brandMenuCat='all';renderBrandMenu();
  var b=BRANDS.find(x=>x.id===currentView.id);
  if(b){
    loadHeroSlides(b._uuid,b.id);
    loadBrandNews(b._uuid,b.id);
    loadBrandCampaigns(b._uuid,b.id);
    loadBrandCoupons(b._uuid,b.id);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand coupon tab full CRUD with service/platform targeting"
```

---

### Task 11: メニュー管理タブ — menu_patterns連携 + 商品CRUD

**Files:**
- Modify: `aiden-admin.html:1414` (brand-menu tab HTML)
- Modify: `aiden-admin.html:1419-1421` (renderBrandMenu, initBrandTabs)
- Remove: `aiden-admin.html:123` (hardcoded MENU constant)

- [ ] **Step 1: ハードコードMENU定数をDB読み込みに置換**

line 123のハードコード`const MENU=[...]`を空配列に変更:

```js
let MENU=[];
```

- [ ] **Step 2: メニュータブHTML更新 — パターン選択ドロップダウン追加**

```js
'<div class="tab-content" id="brand-menu"><div class="card"><div class="card-title">メニュー管理 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddMenuPatternModal(\''+b._uuid+'\',\''+b.id+'\')">＋ パターン追加</button></span></div>'+
'<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><label style="font-size:12px;font-weight:600;white-space:nowrap">メニューパターン:</label><select id="brandMenuPatternSelect" onchange="onMenuPatternChange(\''+b._uuid+'\',\''+b.id+'\')" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;min-width:200px"></select><button class="btn btn-secondary btn-sm" onclick="openEditMenuPatternModal(\''+b._uuid+'\',\''+b.id+'\')">パターン編集</button><button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="deleteMenuPattern(\''+b._uuid+'\',\''+b.id+'\')">パターン削除</button></div>'+
'<div class="card-title" style="margin-top:8px">商品一覧 <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="openAddProductModal(\''+b._uuid+'\',\''+b.id+'\')">＋ 商品追加</button></span></div>'+
'<div class="menu-toolbar"><input class="menu-search" placeholder="🔍 商品名で検索..." id="brandMenuSearch" oninput="renderBrandMenu()"><div id="brandMenuCats" style="margin-top:4px"></div></div><div class="menu-grid" id="brandMenuGrid"></div></div></div>'
```

- [ ] **Step 3: メニューパターンCRUD関数追加**

```js
let currentMenuPatternId=null;

async function loadMenuPatterns(brandUuid,brandDisplayId){
  try{
    var {data:patterns,error}=await sb.from('menu_patterns').select('*').eq('brand_id',brandUuid).order('code');
    if(error)throw error;
    var sel=document.getElementById('brandMenuPatternSelect');
    if(!sel)return;
    if(!patterns||!patterns.length){
      sel.innerHTML='<option value="">パターンなし</option>';
      currentMenuPatternId=null;
      MENU=[];renderBrandMenu();
      return;
    }
    sel.innerHTML=patterns.map(p=>'<option value="'+p.id+'">'+escHtml(p.code)+' — '+escHtml(p.name)+(p.is_active?'':' (無効)')+'</option>').join('');
    currentMenuPatternId=patterns[0].id;
    loadMenuProducts(currentMenuPatternId);
  }catch(e){showToast('⚠️ パターン読込エラー: '+e.message);}
}

function onMenuPatternChange(brandUuid,brandDisplayId){
  var sel=document.getElementById('brandMenuPatternSelect');
  currentMenuPatternId=sel?.value||null;
  if(currentMenuPatternId)loadMenuProducts(currentMenuPatternId);
  else{MENU=[];renderBrandMenu();}
}

async function loadMenuProducts(patternId){
  try{
    var {data:products,error}=await sb.from('products').select('*').eq('menu_pattern_id',patternId).order('category').order('name');
    if(error)throw error;
    MENU=(products||[]).map(p=>({
      _uuid:p.id, id:p.id, name:p.name, price:p.price||0,
      cat:p.category||'その他', emoji:p.emoji||'🍽', desc:p.description||''
    }));
    brandMenuCat='all';
    renderBrandMenu();
  }catch(e){showToast('⚠️ 商品読込エラー: '+e.message);}
}

function openAddMenuPatternModal(brandUuid,brandDisplayId){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>📋 メニューパターン追加</h3>'+
  '<div class="form-grid">'+
    '<div class="form-group"><label>コード</label><input type="text" id="mpCode" placeholder="自動採番" readonly style="background:#f5f6fa;color:var(--text-light)"></div>'+
    '<div class="form-group"><label>パターン名 <span style="color:var(--danger)">*</span></label><input type="text" id="mpName" placeholder="例: 通常メニュー"></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveMenuPattern(\''+brandUuid+'\',\''+brandDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  // Auto-generate code
  sb.from('menu_patterns').select('code').eq('brand_id',brandUuid).order('code',{ascending:false}).limit(1).then(function(res){
    var last=(res.data&&res.data[0])?res.data[0].code:'MP-000';
    var num=parseInt(last.replace('MP-',''))||0;
    var next='MP-'+String(num+1).padStart(3,'0');
    var el=document.getElementById('mpCode');if(el)el.value=next;
  });
}

async function saveMenuPattern(brandUuid,brandDisplayId){
  var code=document.getElementById('mpCode')?.value.trim();
  var name=document.getElementById('mpName')?.value.trim();
  if(!name){showToast('⚠️ パターン名は必須です');return;}
  if(!code)code='MP-001';
  try{
    var {error}=await sb.from('menu_patterns').insert({brand_id:brandUuid,code:code,name:name});
    if(error)throw error;
    logAudit('add_menu_pattern','menu_patterns',null,{brandId:brandDisplayId,code,name});
    closeModal();showToast('✅ メニューパターンを追加しました');
    loadMenuPatterns(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

function openEditMenuPatternModal(brandUuid,brandDisplayId){
  if(!currentMenuPatternId){showToast('⚠️ パターンを選択してください');return;}
  sb.from('menu_patterns').select('*').eq('id',currentMenuPatternId).single().then(function(res){
    var p=res.data;
    if(res.error||!p){showToast('⚠️ データ取得エラー');return;}
    openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>📋 メニューパターン編集</h3>'+
    '<div class="form-grid">'+
      '<div class="form-group"><label>コード</label><input type="text" value="'+escHtml(p.code)+'" readonly style="background:#f5f6fa;color:var(--text-light)"></div>'+
      '<div class="form-group"><label>パターン名 <span style="color:var(--danger)">*</span></label><input type="text" id="editMpName" value="'+escHtml(p.name)+'"></div>'+
      '<div class="form-group"><label>有効</label><select id="editMpActive"><option value="true"'+(p.is_active?' selected':'')+'>有効</option><option value="false"'+(!p.is_active?' selected':'')+'>無効</option></select></div>'+
    '</div>'+
    '<div class="btn-group"><button class="btn btn-primary" onclick="updateMenuPattern(\''+p.id+'\',\''+brandUuid+'\',\''+brandDisplayId+'\')">保存</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  });
}

async function updateMenuPattern(patternId,brandUuid,brandDisplayId){
  var name=document.getElementById('editMpName')?.value.trim();
  if(!name){showToast('⚠️ パターン名は必須です');return;}
  var isActive=document.getElementById('editMpActive')?.value==='true';
  try{
    var {error}=await sb.from('menu_patterns').update({name:name,is_active:isActive}).eq('id',patternId);
    if(error)throw error;
    logAudit('update_menu_pattern','menu_patterns',patternId,{name});
    closeModal();showToast('✅ パターンを更新しました');
    loadMenuPatterns(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteMenuPattern(brandUuid,brandDisplayId){
  if(!currentMenuPatternId){showToast('⚠️ パターンを選択してください');return;}
  if(!confirm('このメニューパターンと紐づく商品を削除しますか？'))return;
  try{
    var {error}=await sb.from('menu_patterns').delete().eq('id',currentMenuPatternId);
    if(error)throw error;
    logAudit('delete_menu_pattern','menu_patterns',currentMenuPatternId,{});
    showToast('✅ パターンを削除しました');
    currentMenuPatternId=null;
    loadMenuPatterns(brandUuid,brandDisplayId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: 商品追加/編集モーダル追加**

```js
function openAddProductModal(brandUuid,brandDisplayId){
  if(!currentMenuPatternId){showToast('⚠️ 先にメニューパターンを作成してください');return;}
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>🍽 商品追加</h3>'+
  '<div class="form-grid">'+
    '<div class="form-group"><label>商品名 <span style="color:var(--danger)">*</span></label><input type="text" id="prodName" placeholder="特選カルビ"></div>'+
    '<div class="form-group"><label>価格（円）<span style="color:var(--danger)">*</span></label><input type="number" id="prodPrice" min="0" placeholder="1280"></div>'+
    '<div class="form-group"><label>カテゴリ</label><input type="text" id="prodCat" placeholder="焼肉"></div>'+
    '<div class="form-group"><label>絵文字</label><input type="text" id="prodEmoji" value="🍽" style="width:60px"></div>'+
    '<div class="form-group full"><label>説明</label><input type="text" id="prodDesc" placeholder="厳選A5ランク黒毛和牛"></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveProduct(\''+brandUuid+'\',\''+brandDisplayId+'\')">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}

async function saveProduct(brandUuid,brandDisplayId){
  var name=document.getElementById('prodName')?.value.trim();
  var price=parseInt(document.getElementById('prodPrice')?.value);
  if(!name||isNaN(price)){showToast('⚠️ 商品名と価格は必須です');return;}
  try{
    var {error}=await sb.from('products').insert({
      name:name, price:price,
      category:document.getElementById('prodCat')?.value.trim()||null,
      emoji:document.getElementById('prodEmoji')?.value.trim()||'🍽',
      description:document.getElementById('prodDesc')?.value.trim()||null,
      menu_pattern_id:currentMenuPatternId,
      brand_id:brandUuid
    });
    if(error)throw error;
    logAudit('add_product','products',null,{name,price,patternId:currentMenuPatternId});
    closeModal();showToast('✅ 商品を追加しました');
    loadMenuProducts(currentMenuPatternId);
  }catch(e){showToast('⚠️ '+e.message);}
}

function openEditProductModal(productUuid){
  sb.from('products').select('*').eq('id',productUuid).single().then(function(res){
    var p=res.data;
    if(res.error||!p){showToast('⚠️ データ取得エラー');return;}
    openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>🍽 商品編集</h3>'+
    '<div class="form-grid">'+
      '<div class="form-group"><label>商品名 <span style="color:var(--danger)">*</span></label><input type="text" id="editProdName" value="'+escHtml(p.name)+'"></div>'+
      '<div class="form-group"><label>価格（円）</label><input type="number" id="editProdPrice" value="'+(p.price||0)+'" min="0"></div>'+
      '<div class="form-group"><label>カテゴリ</label><input type="text" id="editProdCat" value="'+escHtml(p.category||'')+'"></div>'+
      '<div class="form-group"><label>絵文字</label><input type="text" id="editProdEmoji" value="'+escHtml(p.emoji||'🍽')+'" style="width:60px"></div>'+
      '<div class="form-group full"><label>説明</label><input type="text" id="editProdDesc" value="'+escHtml(p.description||'')+'"></div>'+
    '</div>'+
    '<div class="btn-group"><button class="btn btn-primary" onclick="updateProduct(\''+p.id+'\')">保存</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
  });
}

async function updateProduct(productId){
  var name=document.getElementById('editProdName')?.value.trim();
  if(!name){showToast('⚠️ 商品名は必須です');return;}
  try{
    var {error}=await sb.from('products').update({
      name:name,
      price:parseInt(document.getElementById('editProdPrice')?.value)||0,
      category:document.getElementById('editProdCat')?.value.trim()||null,
      emoji:document.getElementById('editProdEmoji')?.value.trim()||'🍽',
      description:document.getElementById('editProdDesc')?.value.trim()||null
    }).eq('id',productId);
    if(error)throw error;
    logAudit('update_product','products',productId,{name});
    closeModal();showToast('✅ 商品を更新しました');
    if(currentMenuPatternId)loadMenuProducts(currentMenuPatternId);
  }catch(e){showToast('⚠️ '+e.message);}
}

async function deleteProduct(productId){
  if(!confirm('この商品を削除しますか？'))return;
  try{
    var {error}=await sb.from('products').delete().eq('id',productId);
    if(error)throw error;
    logAudit('delete_product','products',productId,{});
    showToast('✅ 商品を削除しました');
    if(currentMenuPatternId)loadMenuProducts(currentMenuPatternId);
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 5: renderBrandMenu更新 — DB商品表示+カテゴリ見出し+スペース調整**

```js
function renderBrandMenu(){
  const q=((document.getElementById('brandMenuSearch')||{}).value||'').toLowerCase();
  const cats=['all',...new Set(MENU.map(m=>m.cat))];
  const ce=document.getElementById('brandMenuCats');
  if(ce)ce.innerHTML=cats.map(c=>'<span class="cat-chip'+(brandMenuCat===c?' active':'')+'" onclick="brandMenuCat=\''+c+'\';renderBrandMenu()">'+(c==='all'?'すべて':c)+'</span>').join(' ');
  let items=MENU;
  if(brandMenuCat!=='all')items=items.filter(m=>m.cat===brandMenuCat);
  if(q)items=items.filter(m=>m.name.toLowerCase().includes(q));
  const ge=document.getElementById('brandMenuGrid');
  if(!ge)return;
  if(!items.length){ge.innerHTML='<div class="empty-state">該当なし</div>';return;}
  // Group by category when showing all
  let html='';
  if(brandMenuCat==='all'){
    const grouped={};
    items.forEach(m=>{if(!grouped[m.cat])grouped[m.cat]=[];grouped[m.cat].push(m);});
    Object.keys(grouped).forEach(cat=>{
      html+='<div style="grid-column:1/-1;font-size:13px;font-weight:700;margin:8px 0 4px;padding-top:4px">'+escHtml(cat)+'</div>';
      html+=grouped[cat].map(m=>menuCardHtml(m)).join('');
    });
  }else{
    html=items.map(m=>menuCardHtml(m)).join('');
  }
  ge.innerHTML=html;
}

function menuCardHtml(m){
  return '<div class="mcard"><div class="mcard-img">'+(m.emoji||'🍽')+'</div><div class="mcard-body"><div class="mcard-header"><h4>'+escHtml(m.name)+'</h4><span class="mh-price">'+Y(m.price)+'</span></div><div class="mcard-cat">'+escHtml(m.cat)+'</div><div class="mcard-desc">'+escHtml(m.desc)+'</div><div class="mcard-footer"><button onclick="openEditProductModal(\''+m._uuid+'\')">編集</button><button onclick="deleteProduct(\''+m._uuid+'\')" style="color:var(--danger)">削除</button></div></div></div>';
}
```

- [ ] **Step 6: initBrandTabsにメニューパターンロード追加**

```js
function initBrandTabs(){
  brandMenuCat='all';
  var b=BRANDS.find(x=>x.id===currentView.id);
  if(b){
    loadMenuPatterns(b._uuid,b.id);
    loadHeroSlides(b._uuid,b.id);
    loadBrandNews(b._uuid,b.id);
    loadBrandCampaigns(b._uuid,b.id);
    loadBrandCoupons(b._uuid,b.id);
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: menu patterns + product CRUD with DB persistence (replaces hardcoded MENU)"
```

---

### Task 12: 会員CRM + キャンセルポリシー + 法人店舗タブ

**Files:**
- Modify: `aiden-admin.html:1413` (brand-member tab)
- Modify: `aiden-admin.html:1415` (brand-cancel tab)
- Modify: `aiden-admin.html:1417` (brand-related tab)

- [ ] **Step 1: 会員CRMタブ更新 — DB永続化**

`renderBrandPage`内の`brand-member` div（line 1413）を更新。既存のmembership_programテーブルへの接続は将来タスク（Coming Soon）:

```js
'<div class="tab-content" id="brand-member"><div class="card"><div class="card-title">会員プログラム <span class="ct-right"><span style="font-size:9px;background:#dfe6e9;color:#636e72;padding:2px 6px;border-radius:4px;font-weight:700">Coming Soon</span></span></div><p style="font-size:12px;color:var(--text-light);margin-bottom:12px">会員プログラムの設定はメンバーシップ管理画面で行います。</p><div class="form-grid"><div class="form-group"><label>プログラム名</label><input type="text" value="'+escHtml(b.name)+' メンバーズ" disabled style="background:#f5f6fa;opacity:0.5"></div><div class="form-group"><label>ポイント付与率</label><input type="text" value="1%" disabled style="background:#f5f6fa;opacity:0.5"></div></div></div><div class="card"><div class="card-title">CRM配信 <span class="ct-right"><span style="font-size:9px;background:#dfe6e9;color:#636e72;padding:2px 6px;border-radius:4px;font-weight:700">Coming Soon</span></span></div><div class="toggle-row" style="opacity:0.5;pointer-events:none"><label style="font-size:12px;font-weight:600">メール配信</label><label class="toggle-sw"><input type="checkbox" checked disabled><span class="slider" style="cursor:not-allowed"></span></label></div><div class="toggle-row" style="opacity:0.5;pointer-events:none"><label style="font-size:12px;font-weight:600">LINE配信</label><label class="toggle-sw"><input type="checkbox" checked disabled><span class="slider" style="cursor:not-allowed"></span></label></div></div></div>'
```

- [ ] **Step 2: キャンセルポリシータブ更新 — DB永続化**

`renderBrandPage`内の`brand-cancel` div（line 1415）を更新:

```js
'<div class="tab-content" id="brand-cancel"><div class="card"><div class="card-title">キャンセルポリシー <span class="ct-right"><button class="btn btn-primary btn-sm" onclick="saveBrandCancelPolicy(\''+b.id+'\')">保存</button></span></div><p style="font-size:11px;color:var(--text-light);margin-bottom:12px">ブランド共通のキャンセルポリシーです。店舗ごとに上書き可能です。</p><div class="form-grid cols-3"><div class="form-group"><label>無断キャンセル（%）</label><input type="number" id="cancelNoShow" value="'+(b.cancelPolicy.no_show||100)+'" min="0" max="100"></div><div class="form-group"><label>当日キャンセル（%）</label><input type="number" id="cancelSameDay" value="'+(b.cancelPolicy.same_day||100)+'" min="0" max="100"></div><div class="form-group"><label>3日前キャンセル（%）</label><input type="number" id="cancel3Days" value="'+(b.cancelPolicy['3_days_before']||50)+'" min="0" max="100"></div></div></div></div>'
```

- [ ] **Step 3: saveBrandCancelPolicy関数追加**

```js
async function saveBrandCancelPolicy(brandDisplayId){
  const b=BRANDS.find(x=>x.id===brandDisplayId);
  if(!b)return;
  const policy={
    no_show:parseInt(document.getElementById('cancelNoShow')?.value)||0,
    same_day:parseInt(document.getElementById('cancelSameDay')?.value)||0,
    '3_days_before':parseInt(document.getElementById('cancel3Days')?.value)||0
  };
  try{
    const {error}=await sb.from('brands').update({cancel_policy:policy}).eq('id',b._uuid);
    if(error)throw error;
    b.cancelPolicy=policy;
    logAudit('update_cancel_policy','brands',b._uuid,{policy});
    showToast('✅ キャンセルポリシーを保存しました');
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: 法人店舗タブ更新 — 店舗コード表示 + 複数法人対応**

`renderBrandPage`内の`brand-related` div（line 1417）を更新:

```js
'<div class="tab-content" id="brand-related"><div class="card"><div class="card-title">所属法人</div><div class="link-card" onclick="goToCorp(\''+cp.id+'\')"><div class="lc-icon corp">🏢</div><div class="lc-info"><div class="lc-name">'+escHtml(cp.name)+'</div><div class="lc-sub">'+cp.id+'</div></div><div class="lc-arrow">›</div></div></div><div class="card"><div class="card-title">店舗一覧（'+ss.length+'）</div>'+
(ss.length?'<table class="data-table"><thead><tr><th>店舗コード</th><th>店舗名</th><th>住所</th><th>ステータス</th><th></th></tr></thead><tbody>'+
ss.map(s=>'<tr><td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+s.id+'</code></td><td style="font-weight:600">'+escHtml(s.name)+'</td><td style="font-size:11px">'+escHtml(s.addr)+'</td><td>'+statusBadge(s.status)+'</td><td><button class="btn btn-secondary btn-sm" onclick="goToStore(\''+s.id+'\')">詳細</button></td></tr>').join('')+
'</tbody></table>':'<div class="empty-state">店舗がありません</div>')+
'</div></div>'
```

- [ ] **Step 5: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: brand member CRM (Coming Soon), cancel policy DB save, store code in related tab"
```

---

### Task 13: FC権限制御 — brand_permissions連携

**Files:**
- Modify: `aiden-admin.html` — loadAllData, renderBrandPage

管理マスタは全権限で操作可能（service_role）だが、将来の顧客管理画面用にbrand_permissionsの概念をUIに反映する。

- [ ] **Step 1: brand_permissionsデータの読み込み**

`loadAllData`にbrand_permissions読み込みを追加:

```js
// loadAllData内、ACCOUNTS読み込みの後に追加
let BRAND_PERMISSIONS=[];
const {data:bpRaw}=await sb.from('brand_permissions').select('*');
BRAND_PERMISSIONS=bpRaw||[];
```

`BRAND_PERMISSIONS`の宣言はグローバル変数として`let BRANDS=[];`の近くに追加。

- [ ] **Step 2: openAddBrandModal更新 — FC質問追加**

`openAddBrandModal`（line 1757）のモーダルに「自社ブランドですか？FC加盟ですか？」の質問を追加:

```js
function openAddBrandModal(){
  openModal('<button class="modal-close" onclick="closeModal()">✕</button><h3>🏷️ ブランド追加</h3>'+
  '<div class="form-grid">'+
  '<div class="form-group"><label>ブランド名 <span style="color:var(--danger)">*</span></label><input type="text" id="addBrandName" placeholder="例: 焼肉 炭火亭"></div>'+
  '<div class="form-group"><label>スラッグ <span style="color:var(--danger)">*</span></label><input type="text" id="addBrandSlug" placeholder="例: sumibite"></div>'+
  '<div class="form-group"><label>所属法人 <span style="color:var(--danger)">*</span></label><select id="addBrandCorp">'+CORPS.map(c=>'<option value="'+c.id+'">'+escHtml(c.name)+'</option>').join('')+'</select></div>'+
  '<div class="form-group"><label>ブランド種別</label><select id="addBrandType"><option value="own">自社ブランド（owner権限）</option><option value="fc">FC加盟（viewer権限）</option></select></div>'+
  '<div class="form-group"><label>メインカラー</label><input type="color" id="addBrandColor" value="#6c5ce7" style="width:60px;height:36px;border:none;cursor:pointer"></div>'+
  '<div class="form-group"><label>ステータス</label><select id="addBrandStatus"><option value="active" selected>稼働中</option><option value="trial">トライアル</option></select></div>'+
  '</div>'+
  '<div class="btn-group"><button class="btn btn-primary" onclick="saveBrand()">追加</button><button class="btn btn-secondary" onclick="closeModal()">キャンセル</button></div>');
}
```

- [ ] **Step 3: saveBrand更新 — brand_permissions自動設定**

```js
async function saveBrand(){
  const name=document.getElementById('addBrandName').value.trim();
  const slug=document.getElementById('addBrandSlug').value.trim();
  if(!name||!slug){showToast('⚠️ ブランド名とスラッグは必須です');return;}
  const corpDisplayId=document.getElementById('addBrandCorp').value;
  const corp=CORPS.find(c=>c.id===corpDisplayId);
  if(!corp){showToast('⚠️ 法人を選択してください');return;}
  const mainColor=document.getElementById('addBrandColor').value;
  const brandType=document.getElementById('addBrandType')?.value||'own';
  try{
    const res=await fetch('/api/admin/brands',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+await getToken()},body:JSON.stringify({name:name,corp_id:corp._uuid,primary_color:mainColor,slug:slug})});
    const d=await res.json();if(!res.ok)throw new Error(d.error||'保存に失敗');
    BRANDS.push({_uuid:d.data.id,id:d.data.display_id,corpId:corpDisplayId,name:name,slug:slug,status:'active',mainColor:mainColor,secondaryColor:'#1A1A1A',fontFamilies:['Noto Sans JP'],socialLinks:{},serviceSettings:{},designSettings:{},hpSettings:{},cancelPolicy:{no_show:100,same_day:100,'3_days_before':50},pii_access_settings:{...PII_ACCESS_DEFAULTS}});
    // Auto-create brand_permission for corp accounts
    const corpAccounts=ACCOUNTS.filter(a=>a.corpId===corpDisplayId);
    const role=brandType==='fc'?'viewer':'owner';
    for(const acc of corpAccounts){
      await sb.from('brand_permissions').insert({account_id:acc._uuid,brand_id:d.data.id,role:role}).catch(()=>{});
    }
    logAudit('add_brand','brands',d.data.id,{name,slug,brandType,role});
    closeModal();showToast('✅ ブランドを追加しました（'+role+'権限を設定）');renderPage();
  }catch(e){showToast('⚠️ '+e.message);}
}
```

- [ ] **Step 4: Commit**

```bash
git add aiden-admin.html
git commit -m "feat: FC brand permission auto-setup on brand creation (owner/viewer)"
```

---

### Task 14: 最終確認 + lint + push

**Files:**
- All modified files

- [ ] **Step 1: npm run lint**

```bash
npm run lint
```

Fix any issues found.

- [ ] **Step 2: git pull --rebase**

```bash
git pull --rebase origin main
```

- [ ] **Step 3: Verify all changes**

```bash
git diff HEAD~10 --stat
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Deploy**

```bash
vercel --prod
```

- [ ] **Step 6: ブラウザ動作確認**

本番URL (`https://aiden-jp.net`) で以下を確認:
1. ブランド一覧表示
2. ブランド詳細→全12タブ切替
3. 基本情報保存→リロードして値維持
4. SNSリンク保存→リロードして値維持
5. サービス設定Coming Soonバッジ表示
6. デザイン保存→リロードして値維持
7. HP設定保存+ヒーローバナー追加/削除
8. ニュース追加/編集/削除
9. キャンペーン追加/編集/削除
10. クーポン追加/編集/削除
11. メニューパターン作成→商品追加/編集/削除
12. キャンセルポリシー保存→リロードして値維持
13. 法人店舗タブに店舗コード表示

---

## 注意事項

- マイグレーション（Task 1）は手動実行が必要: `supabase/migrations/20260405100000_phase2_brand_extensions.sql`
- `brand_news`テーブルの`body_html`カラムと`brand_campaigns`テーブルは既存（Phase 0で作成済み）— 追加マイグレーション不要
- `brand_hero_slides`テーブルも既存（`20260402000000_brand_hp_redesign.sql`で作成済み）
- 会員CRMタブはComing Soonとして表示（membership_programテーブルとの連携は別フェーズ）
- ロゴのドラッグ&ドロップはComing Soonとして表示（Storage連携は別フェーズ）
