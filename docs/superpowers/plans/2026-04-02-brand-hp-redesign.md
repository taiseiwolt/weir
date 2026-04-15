# Brand HP Redesign + Custom Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the brand homepage (rename from aiden-brand-sushiro.html to brand.html), add custom domain support, hero carousel, campaign management, news detail pages, and various UI improvements across 15 items.

**Architecture:** File rename + Vercel rewrites for URL cleanup. Custom domain detection via `window.location.hostname` matched against `brands.custom_domain` DB column. New DB tables for campaigns and hero slides. Admin panel extended with new management sections. All changes are pure HTML/Vanilla JS with Supabase backend.

**Tech Stack:** HTML/Vanilla JS, Supabase (PostgreSQL), Vercel (rewrites/custom domains), CSS

---

## File Structure

### Files to Create
- `brand.html` — renamed from `aiden-brand-sushiro.html` (main brand homepage)
- `brand-news-detail.html` — individual news article page
- `supabase/migrations/20260402000000_brand_hp_redesign.sql` — DB migration (custom_domain, brand_campaigns, brand_hero_slides)

### Files to Modify (main project, excluding worktrees and versioned files)
- `vercel.json` — rewrite rules for brand.html and custom domain
- `weir-brand-news.html` — update internal links
- `weir-brand-stores.html` — update internal links
- `weir-brand-menu.html` — update internal links
- `weir-privacy.html` — update internal links
- `weir-sitemap.html` — update internal links + add news detail entry
- `aiden-terms-v1.3.html` — update internal links
- `weir-order.html` — update internal links
- `aiden-order-v21.html` — update internal links
- `weir-membership.html` — update internal links
- `weir-customer-admin.html` — update internal links + add admin sections
- `index.html` — update demo link
- `weir-order-store.html` — add `type` URL parameter support
- `weir-admin.html` — add carousel/campaign/news/custom_domain management sections
- `CLAUDE.md` — update file reference from aiden-brand-sushiro.html to brand.html
- Versioned files: `aiden-brand-news-v1.4.html`, `aiden-brand-stores-v1.4.html`, `aiden-brand-menu-v1.7.html`, `aiden-privacy-v1.3.html`, `aiden-sitemap-v1.3.html`, `aiden-customer-admin-v24.91.html`

---

## Task 1: Database Migration SQL

**Files:**
- Create: `supabase/migrations/20260402000000_brand_hp_redesign.sql`

This migration adds: `custom_domain` column to brands, `brand_campaigns` table, `brand_hero_slides` table, and `body_html` column to `brand_news`.

- [ ] **Step 1: Read current DB schema to confirm column names**

Run the Supabase query via the API or SQL editor to verify the exact columns on `brands` and `brand_news` tables. Confirm `custom_domain` does not exist on brands.

- [ ] **Step 2: Write the migration SQL file**

Create `supabase/migrations/20260402000000_brand_hp_redesign.sql`:

```sql
-- =====================================================
-- Brand HP Redesign Migration
-- 2026-04-02
-- =====================================================

-- 1. Add custom_domain to brands
ALTER TABLE brands ADD COLUMN IF NOT EXISTS custom_domain text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_custom_domain ON brands(custom_domain) WHERE custom_domain IS NOT NULL;
COMMENT ON COLUMN brands.custom_domain IS 'Custom domain for white-label brand HP (e.g. www.ikinari-steak.com)';

-- 2. Brand Hero Slides (carousel images/videos for brand HP hero section)
CREATE TABLE IF NOT EXISTS brand_hero_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  alt_text text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_hero_slides_brand ON brand_hero_slides(brand_id, sort_order);

ALTER TABLE brand_hero_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON brand_hero_slides TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON brand_hero_slides FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "authenticated_read" ON brand_hero_slides FOR SELECT TO authenticated USING (is_active = true);

-- 3. Brand Campaigns
CREATE TABLE IF NOT EXISTS brand_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  media_url text,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  link_url text,
  start_date date,
  end_date date,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_campaigns_brand ON brand_campaigns(brand_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_brand_campaigns_dates ON brand_campaigns(start_date, end_date);

ALTER TABLE brand_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON brand_campaigns TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read" ON brand_campaigns FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "authenticated_read" ON brand_campaigns FOR SELECT TO authenticated USING (is_active = true);

-- 4. Add body_html to brand_news for rich text content
ALTER TABLE brand_news ADD COLUMN IF NOT EXISTS body_html text;
COMMENT ON COLUMN brand_news.body_html IS 'HTML body content for news detail page (rendered from Markdown in admin)';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402000000_brand_hp_redesign.sql
git commit -m "feat: add migration for brand HP redesign (custom_domain, hero_slides, campaigns, news body)"
```

---

## Task 2: File Rename + Internal Link Updates

**Files:**
- Rename: `aiden-brand-sushiro.html` → `brand.html`
- Modify: 18 HTML files (see list below)
- Modify: `vercel.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rename the file**

```bash
git mv aiden-brand-sushiro.html brand.html
```

- [ ] **Step 2: Update all internal links in brand.html itself**

In `brand.html`, update:
- Line 11: `og:url` meta tag — change `aiden-brand-sushiro.html` to `brand.html`
- Line 108: Link propagation in DOMContentLoaded — change `./weir-brand-` prefix check to `./brand` and `./weir-brand-` (both patterns since subpages still use `aiden-brand-` prefix)

- [ ] **Step 3: Update internal links in all other HTML files**

Replace `./weir-brand-sushiro.html` with `./brand.html` in these files:

| File | Lines |
|------|-------|
| `weir-brand-news.html` | 80, 111 |
| `weir-brand-stores.html` | 183, 208 |
| `weir-brand-menu.html` | 174, 203 |
| `weir-privacy.html` | 60, 187 |
| `weir-sitemap.html` | 60, 74, 76, 77, 78, 180 |
| `aiden-terms-v1.3.html` | 45, 148 |
| `weir-order.html` | 619 |
| `aiden-order-v21.html` | 619 |
| `weir-membership.html` | 133 |
| `weir-customer-admin.html` | 2646 |
| `index.html` | 90 (change ./weir-brand-sushiro.html` to `/brand.html`) |

Also update versioned files:
| File | Lines |
|------|-------|
| `aiden-brand-news-v1.4.html` | 68, 99 |
| `aiden-brand-stores-v1.4.html` | 171, 196 |
| `aiden-brand-menu-v1.7.html` | 162, 191 |
| `aiden-privacy-v1.3.html` | 48, 175 |
| `aiden-sitemap-v1.3.html` | 48, 62, 64, 65, 66, 168 |
| `aiden-customer-admin-v24.91.html` | 2345 |

- [ ] **Step 4: Update vercel.json**

Change line 18 rewrite from:
```json
{ "source": "/", "destination": ./weir-brand-sushiro.html" }
```
to:
```json
{ "source": "/", "destination": "/brand.html" }
```

Also add a backwards-compatibility rewrite BEFORE the catch-all 404 rule:
```json
{ "source": ./weir-brand-sushiro.html", "destination": "/brand.html" }
```

Add path-based brand slug rewrite (for `/ikinari-steak` style URLs):
```json
{ "source": "/:slug((?!api|legal|aiden-|brand|404|index|test-|e2e-|playwright|seed-|qa-|docs).*)", "destination": "/brand.html?brand=:slug" }
```

- [ ] **Step 5: Update CLAUDE.md**

Replace `aiden-brand-sushiro.html` with `brand.html` in the project structure section.

- [ ] **Step 6: Verify no remaining references**

```bash
grep -r "aiden-brand-sushiro" --include="*.html" --include="*.json" --include="*.js" --include="*.cjs" . | grep -v ".claude/worktrees" | grep -v "node_modules"
```

Expected: Only test files and documentation may remain (acceptable).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename aiden-brand-sushiro.html to brand.html and update all internal links"
```

---

## Task 3: Custom Domain Detection Logic

**Files:**
- Modify: `brand.html` (the `resolveBrandId()` function)

- [ ] **Step 1: Replace `resolveBrandId()` with hostname-based detection**

In `brand.html`, replace the existing `resolveBrandId()` function (around line 472-480) with:

```javascript
async function resolveBrandId() {
  // 1. Try custom domain detection (highest priority)
  var hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== 'weir.co.jp' && !hostname.endsWith('.vercel.app')) {
    var { data: domainMatch } = await sb.from('brands').select('id').eq('custom_domain', hostname).limit(1);
    if (domainMatch && domainMatch.length > 0) return domainMatch[0].id;
  }

  // 2. Fallback: URL parameter ?brand=xxx
  if (!_brandParam) return DEFAULT_BRAND_ID;
  // Try matching brand by slug directly
  var { data: brandBySlug } = await sb.from('brands').select('id').eq('slug', _brandParam).limit(1);
  if (brandBySlug && brandBySlug.length > 0) return brandBySlug[0].id;
  // Legacy: try matching via store slug prefix
  var prefix = _brandParam.split('-')[0];
  var { data } = await sb.from('stores').select('brand_id').ilike('slug', prefix + '-%').limit(1);
  if (data && data.length > 0) return data[0].brand_id;
  var { data: exact } = await sb.from('stores').select('brand_id').eq('slug', _brandParam).limit(1);
  if (exact && exact.length > 0) return exact[0].brand_id;
  return DEFAULT_BRAND_ID;
}
```

- [ ] **Step 2: Update link propagation in DOMContentLoaded**

Update the link propagation logic (around line 1106-1112) to handle both `brand.html` and `aiden-brand-*` links:

```javascript
document.addEventListener('DOMContentLoaded', async function() {
  if (_brandParam) {
    document.querySelectorAll('a[href]').forEach(function(a) {
      var h = a.getAttribute('href');
      if (h && (h.startsWith('./weir-brand-') || h === './brand.html') && !h.includes('brand=')) {
        a.href = h + (h.includes('?') ? '&' : '?') + 'brand=' + encodeURIComponent(_brandParam);
      }
    });
  }
  await loadFromSupabase();
  applyBrandConfig();
  renderSns();
});
```

- [ ] **Step 3: Update OGP meta tags dynamically**

After `applyBrandConfig()`, add dynamic OGP update:

```javascript
// Update OGP for custom domain
if (BRAND_CONFIG.name) {
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = BRAND_CONFIG.name;
  var ogSiteName = document.querySelector('meta[property="og:site_name"]');
  if (ogSiteName) ogSiteName.content = BRAND_CONFIG.name;
}
```

- [ ] **Step 4: Commit**

```bash
git add brand.html
git commit -m "feat: add custom domain detection and brand slug resolution"
```

---

## Task 4: Header UI Modifications (Items #1, #2)

**Files:**
- Modify: `brand.html`

- [ ] **Step 1: Remove circle logo from header (#1)**

In `brand.html`, remove the `header-logo-mark` span from the header (around line 286):

Change:
```html
<span style="display:flex;align-items:center;gap:10px">
  <!-- ロゴマーク：管理画面でjpg/png/svgをアップロード。未設定時は絵文字 -->
  <span class="header-logo-mark" id="logo-mark">🔥</span>
  <!-- ロゴテキスト：管理画面で画像アップロードまたはフリーテキスト入力 -->
  <span class="header-logo-text" id="logo-text">炭火亭</span>
</span>
```

To:
```html
<span style="display:flex;align-items:center;gap:10px">
  <!-- ロゴテキスト：管理画面で画像アップロードまたはフリーテキスト入力 -->
  <span class="header-logo-text" id="logo-text">炭火亭</span>
</span>
```

Also update `applyBrandConfig()` to remove the header logo-mark references (lines 852-860). Remove the `mark` variable and the `if (c.logoMarkType === 'image'...)` block for the header mark. Keep only the footer mark code.

- [ ] **Step 2: Change 「会員プログラム」→「会員特典」(#2)**

In `brand.html`, update the nav link text (line 295):

Change:
```html
<a href="./weir-membership.html" class="header-nav-link" data-i18n="nav_membership">会員プログラム</a>
```
To:
```html
<a href="./weir-membership.html" class="header-nav-link" data-i18n="nav_membership">会員特典</a>
```

Also update in mobile nav (line 326):
```html
<a href="./weir-membership.html" data-i18n="nav_membership">🏆 会員特典</a>
```

Update all i18n dictionaries — change `nav_membership` value from `'会員プログラム'` to `'会員特典'` in ja dict, and update corresponding translations in en/zh/ko/fr/it/id:
- ja: `'会員特典'`
- en: `'Member Benefits'`
- zh: `'会员特典'`
- ko: `'회원 혜택'`
- fr: `'Avantages membres'`
- it: `'Vantaggi membri'`
- id: `'Keuntungan Member'`

Also update footer (line 443):
```html
<a href="./weir-membership.html" data-i18n="nav_membership">会員特典</a>
```

- [ ] **Step 3: Commit**

```bash
git add brand.html
git commit -m "fix: remove header circle logo and rename 会員プログラム to 会員特典"
```

---

## Task 5: Hero Carousel (Items #3, #4)

**Files:**
- Modify: `brand.html` (CSS + HTML + JS)

- [ ] **Step 1: Add carousel CSS**

Add after the existing `.hero-play-pause` CSS block (around line 91):

```css
/* ===== HERO CAROUSEL ===== */
.hero-carousel{position:relative;width:100%;height:100%}
.hero-slides{display:flex;transition:transform .6s ease;height:100%}
.hero-slide{flex:0 0 100%;height:100%;display:flex;align-items:center;justify-content:center}
.hero-slide img{max-width:100%;max-height:100%;object-fit:contain}
.hero-slide video{max-width:100%;max-height:100%;object-fit:contain}
.hero-dots{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10}
.hero-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.4);border:none;cursor:pointer;padding:0;transition:background .2s}
.hero-dot.active{background:white}
.hero-arrow{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.3);color:white;border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center;transition:background .2s}
.hero-arrow:hover{background:rgba(0,0,0,.5)}
.hero-arrow.prev{left:12px}
.hero-arrow.next{right:12px}
```

- [ ] **Step 2: Update hero HTML structure**

Replace the hero section HTML (lines 330-341):

```html
<!-- ===== HERO ===== -->
<div class="hero">
  <div class="hero-video-wrap" id="hero-wrap">
    <div class="hero-carousel" id="hero-carousel">
      <div class="hero-slides" id="hero-slides">
        <div class="hero-slide" id="hero-bg" style="background:var(--brand-primary)">
          <div class="hero-video-placeholder" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:120px;background:linear-gradient(135deg,#1a0000 0%,#4a0e0e 40%,#2a0000 100%)">🥩</div>
        </div>
      </div>
      <button class="hero-arrow prev" onclick="heroSlide(-1)">&#8249;</button>
      <button class="hero-arrow next" onclick="heroSlide(1)">&#8250;</button>
      <div class="hero-dots" id="hero-dots"></div>
    </div>
    <div class="hero-overlay">
      <div class="hero-content">
        <div class="hero-catch" id="hero-catch" data-i18n="hero_catch">うまい肉を、炭火で。<br>うまい肉で、心も一杯。</div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add carousel JS**

Add carousel control JS in the `<script>` section:

```javascript
/* =====================================================
   HERO CAROUSEL
   ===================================================== */
var heroCurrentSlide = 0;
var heroSlideCount = 1;
var heroAutoplayTimer = null;

function heroSlide(dir) {
  heroCurrentSlide = (heroCurrentSlide + dir + heroSlideCount) % heroSlideCount;
  updateHeroSlide();
  resetHeroAutoplay();
}

function heroGoTo(idx) {
  heroCurrentSlide = idx;
  updateHeroSlide();
  resetHeroAutoplay();
}

function updateHeroSlide() {
  var slides = document.getElementById('hero-slides');
  if (slides) slides.style.transform = 'translateX(-' + (heroCurrentSlide * 100) + '%)';
  document.querySelectorAll('.hero-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === heroCurrentSlide);
  });
}

function resetHeroAutoplay() {
  if (heroAutoplayTimer) clearInterval(heroAutoplayTimer);
  if (heroSlideCount > 1) {
    heroAutoplayTimer = setInterval(function() {
      heroCurrentSlide = (heroCurrentSlide + 1) % heroSlideCount;
      updateHeroSlide();
    }, 5000);
  }
}

function renderHeroCarousel(slides, brandColor) {
  var container = document.getElementById('hero-slides');
  var dotsContainer = document.getElementById('hero-dots');
  if (!container || !slides || slides.length === 0) return;

  var bgColor = brandColor || 'var(--brand-primary)';
  container.innerHTML = slides.map(function(s) {
    if (s.media_type === 'video') {
      return '<div class="hero-slide" style="background:' + escH(bgColor) + '"><video src="' + escH(s.media_url) + '" autoplay muted loop playsinline style="max-width:100%;max-height:100%;object-fit:contain"></video></div>';
    }
    return '<div class="hero-slide" style="background:' + escH(bgColor) + '"><img src="' + escH(s.media_url) + '" alt="' + escH(s.alt_text || '') + '" loading="lazy"></div>';
  }).join('');

  heroSlideCount = slides.length;
  heroCurrentSlide = 0;

  // Render dots
  if (dotsContainer && slides.length > 1) {
    dotsContainer.innerHTML = slides.map(function(_, i) {
      return '<button class="hero-dot' + (i === 0 ? ' active' : '') + '" onclick="heroGoTo(' + i + ')"></button>';
    }).join('');
  }

  // Start autoplay
  resetHeroAutoplay();

  // Touch/swipe support
  var startX = 0;
  var wrap = document.getElementById('hero-wrap');
  if (wrap) {
    wrap.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, {passive: true});
    wrap.addEventListener('touchend', function(e) {
      var diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) heroSlide(diff > 0 ? 1 : -1);
    }, {passive: true});
  }
}
```

- [ ] **Step 4: Update `loadFromSupabase()` to load hero slides**

In the `loadFromSupabase()` function, after loading brand config (around line 984), add:

```javascript
// Load hero slides for carousel
var heroSlidesRes = await sb.from('brand_hero_slides').select('media_url, media_type, alt_text, sort_order').eq('brand_id', brandId).eq('is_active', true).order('sort_order');
if (heroSlidesRes.data && heroSlidesRes.data.length > 0) {
  renderHeroCarousel(heroSlidesRes.data, b ? b.primary_color : null);
} else {
  // Fallback: use existing media table hero image
  // (handled later in media loading section)
}
```

Also update the existing hero media loading code (around line 1032-1038) to call `renderHeroCarousel` as fallback:

```javascript
// Hero background image (fallback from media table)
if (heroMedia.length > 0 && !(heroSlidesRes && heroSlidesRes.data && heroSlidesRes.data.length > 0)) {
  renderHeroCarousel(heroMedia.map(function(m) {
    return { media_url: m.url, media_type: 'image', alt_text: m.title };
  }), BRAND_CONFIG.primaryColor);
}
```

- [ ] **Step 5: Remove old hero placeholder and play/pause button**

Remove the `toggleVideo()` function and the `hero-play-pause` button since the carousel replaces it.

- [ ] **Step 6: Commit**

```bash
git add brand.html
git commit -m "feat: add hero carousel with auto-scroll, swipe, and brand color background"
```

---

## Task 6: Campaign Section Redesign (Items #5, #6, #7)

**Files:**
- Modify: `brand.html`

- [ ] **Step 1: Update campaign section HTML**

Replace the campaign section (lines 343-358) with:

```html
<!-- ===== キャンペーン ===== -->
<section class="campaign-section" id="campaign">
  <div class="campaign-section-inner">
    <div class="sec-title"><span data-i18n="sec_campaign">キャンペーン</span></div>
    <div class="campaign-scroll" id="campaign-scroll">
      <!-- Populated dynamically from brand_campaigns table -->
    </div>
  </div>
</section>
```

Note: The 「おすすめ一覧」link at the bottom is removed (#7).

- [ ] **Step 2: Update i18n dictionaries**

Add/update campaign-related i18n entries:
- ja: `sec_campaign: 'キャンペーン'`
- en: `sec_campaign: 'Campaigns'`
- zh: `sec_campaign: '活动'`
- ko: `sec_campaign: '캠페인'`
- fr: `sec_campaign: 'Campagnes'`
- it: `sec_campaign: 'Campagne'`
- id: `sec_campaign: 'Kampanye'`

Remove old `sec_recommend`, `sec_recommend_more`, `campaign_now`, `campaign_label`, and `camp1`-`camp6` i18n keys from all language dictionaries.

- [ ] **Step 3: Add campaign loading in `loadFromSupabase()`**

Add after the hero slides loading:

```javascript
// Load campaigns
var today = new Date().toISOString().split('T')[0];
var campaignsRes = await sb.from('brand_campaigns')
  .select('id, title, description, media_url, media_type, link_url, start_date, end_date, sort_order')
  .eq('brand_id', brandId)
  .eq('is_active', true)
  .or('start_date.is.null,start_date.lte.' + today)
  .or('end_date.is.null,end_date.gte.' + today)
  .order('sort_order');

if (campaignsRes.data && campaignsRes.data.length > 0) {
  var cs = document.getElementById('campaign-scroll');
  if (cs) {
    cs.innerHTML = campaignsRes.data.map(function(c) {
      var mediaHtml = '';
      if (c.media_url) {
        if (c.media_type === 'video') {
          mediaHtml = '<video src="' + escH(c.media_url) + '" controls preload="metadata" style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:4px"></video>';
        } else {
          mediaHtml = '<div class="campaign-item-img" style="background:url(' + encodeURI(c.media_url) + ') center/cover no-repeat"></div>';
        }
      } else {
        mediaHtml = '<div class="campaign-item-img" style="background:linear-gradient(135deg,var(--brand-primary-dark),var(--brand-primary))"></div>';
      }
      var wrapper = c.link_url ? 'a href="' + escH(c.link_url) + '"' : 'div';
      var wrapperClose = c.link_url ? 'a' : 'div';
      return '<' + wrapper + ' class="campaign-item" style="text-decoration:none;color:inherit">' + mediaHtml + '<div class="campaign-item-title">' + escH(c.title) + '</div></' + wrapperClose + '>';
    }).join('');
  }
} else {
  // Hide campaign section if no campaigns
  var campSection = document.querySelector('.campaign-section');
  if (campSection) campSection.style.display = 'none';
}
```

- [ ] **Step 4: Remove old hardcoded campaign/recommend code**

Remove the old `recMedia` rendering logic from the media loading section (around lines 1041-1050), since campaigns now come from the `brand_campaigns` table.

Also remove the `applyBrandConfig()` code that updates `sec-title-more` links (around lines 887-891), since the おすすめ一覧 link no longer exists.

- [ ] **Step 5: Commit**

```bash
git add brand.html
git commit -m "feat: replace recommend section with campaign management from brand_campaigns table"
```

---

## Task 7: MO Button Split (Item #8)

**Files:**
- Modify: `brand.html` (CTA section)
- Modify: `weir-order-store.html` (type param support)

- [ ] **Step 1: Update CTA buttons in brand.html**

The MENU CTA section (lines 362-378) already has separate takeout/delivery buttons linking to `./weir-order.html?mode=takeout` and `./weir-order.html?mode=delivery`. The spec asks for direct links to `weir-order-store.html?store_id=xxx&type=takeout`.

However, since the brand page represents multiple stores, the CTA should link to the order page with mode selection (which then shows store list). The existing implementation is already correct for brand-level navigation. Update the mobile nav (lines 319-323) to also pass mode params:

```html
<div class="mobile-nav-cta">
  <a href="javascript:void(0)" data-i18n="nav_reserve" onclick="openResModal()">📅 来店予約</a>
  <a href="./weir-order.html?mode=takeout" data-i18n="nav_order_short">🥡 お持ち帰り</a>
  <a href="./weir-order.html?mode=delivery">🛵 デリバリー</a>
</div>
```

- [ ] **Step 2: Add type param support in weir-order-store.html**

In `weir-order-store.html`, add URL parameter reading after the `orderMode` declaration (around line 1062):

```javascript
let orderMode = 'delivery'; // 'takeout' or 'delivery'
// Read type from URL parameter
(function() {
  var urlParams = new URLSearchParams(window.location.search);
  var typeParam = urlParams.get('type');
  if (typeParam === 'takeout' || typeParam === 'delivery' || typeParam === 'dinein') {
    orderMode = typeParam;
  }
  // Also check sessionStorage for mode passed from order page
  try {
    var stored = JSON.parse(sessionStorage.getItem('aiden_selected_store') || '{}');
    if (stored.orderMode && !typeParam) orderMode = stored.orderMode;
  } catch(e) {}
})();
```

- [ ] **Step 3: Commit**

```bash
git add brand.html weir-order-store.html
git commit -m "feat: add type URL param support for MO order mode selection"
```

---

## Task 8: News Detail Page (Item #9)

**Files:**
- Create: `brand-news-detail.html`
- Modify: `brand.html` (news item links)
- Modify: `weir-brand-news.html` (news item links)

- [ ] **Step 1: Create brand-news-detail.html**

Create a new file `brand-news-detail.html` with:
- Same header/footer structure as brand.html (simplified)
- Supabase client initialization
- Brand resolution and config loading
- News article display: title, date, category badge, image, body_html content
- Breadcrumb navigation
- Back to news list link

The file should follow the same patterns as other brand sub-pages (weir-brand-news.html etc.):
- Load brand config from Supabase
- Apply brand colors/fonts
- Propagate `?brand=` param to navigation links
- Include marked.js CDN for Markdown rendering

Key HTML structure:
```html
<article class="news-detail">
  <div class="news-detail-inner">
    <nav class="breadcrumb">
      <a href="./brand.html">トップ</a> &gt;
      <a href="./weir-brand-news.html">ニュース</a> &gt;
      <span id="news-detail-title-bc">記事</span>
    </nav>
    <div class="news-detail-header">
      <div class="news-detail-meta">
        <span class="news-date" id="news-detail-date"></span>
        <span class="news-cat" id="news-detail-cat"></span>
      </div>
      <h1 id="news-detail-title"></h1>
    </div>
    <div class="news-detail-image" id="news-detail-image"></div>
    <div class="news-detail-body" id="news-detail-body"></div>
    <div class="news-detail-back">
      <a href="./weir-brand-news.html">← ニュース一覧に戻る</a>
    </div>
  </div>
</article>
```

JS to load article:
```javascript
var newsId = new URLSearchParams(window.location.search).get('news_id');
if (newsId) {
  var { data: article } = await sb.from('brand_news')
    .select('id, title, category, published_at, image_url, body, body_html, url')
    .eq('id', newsId)
    .single();
  if (article) {
    document.getElementById('news-detail-title').textContent = article.title;
    document.getElementById('news-detail-title-bc').textContent = article.title;
    // Format date
    var d = new Date(article.published_at);
    document.getElementById('news-detail-date').textContent = d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
    // Category
    var catEl = document.getElementById('news-detail-cat');
    var catMap = {store:'お店情報', corp:'会社情報', menu:'メニュー', info:'お知らせ'};
    catEl.textContent = catMap[article.category] || article.category;
    catEl.className = 'news-cat ' + (article.category || '');
    // Image
    if (article.image_url) {
      document.getElementById('news-detail-image').innerHTML = '<img src="' + escH(article.image_url) + '" alt="' + escH(article.title) + '" style="width:100%;border-radius:6px">';
    }
    // Body: prefer body_html, fallback to body (plain text)
    var bodyEl = document.getElementById('news-detail-body');
    if (article.body_html) {
      bodyEl.innerHTML = article.body_html;
    } else if (article.body) {
      bodyEl.textContent = article.body;
    }
    document.title = article.title + ' | ' + BRAND_CONFIG.name;
  }
}
```

Full file content is ~300 lines, following the pattern of `weir-brand-news.html` for header/footer structure.

- [ ] **Step 2: Update news item links in brand.html**

In `brand.html`, update the news rendering code (around line 1015-1021) to link to the detail page:

Change:
```javascript
return '<div class="news-item"><span class="news-date">' + ds + '</span><span class="news-cat ' + escH(n.category) + '">' + escH(catLabel) + '</span><span class="news-title"><a href="' + escH(n.url || '#') + '">' + escH(n.title) + '</a></span></div>';
```

To:
```javascript
var detailUrl = './brand-news-detail.html?news_id=' + encodeURIComponent(n.id) + (_brandParam ? '&brand=' + encodeURIComponent(_brandParam) : '');
return '<div class="news-item" onclick="window.location.href=\'' + escH(detailUrl) + '\'"><span class="news-date">' + ds + '</span><span class="news-cat ' + escH(n.category) + '">' + escH(catLabel) + '</span><span class="news-title"><a href="' + escH(detailUrl) + '">' + escH(n.title) + '</a></span></div>';
```

- [ ] **Step 3: Update news list page links**

In `weir-brand-news.html`, update the news item rendering to link to `brand-news-detail.html?news_id=xxx` instead of `#` or external URLs.

- [ ] **Step 4: Commit**

```bash
git add brand-news-detail.html brand.html weir-brand-news.html
git commit -m "feat: add news detail page with article rendering"
```

---

## Task 9: Footer Modifications (Items #10, #11, #12)

**Files:**
- Modify: `brand.html`

- [ ] **Step 1: Remove footer circle logo (#10)**

In the footer section (around line 437), remove the `footer-logo-mark` div:

Change:
```html
<div class="footer-logo"><div class="footer-logo-mark" id="footer-logo-mark">🔥</div><div class="footer-logo-text" id="footer-logo-text">炭火亭</div></div>
```

To:
```html
<div class="footer-logo"><div class="footer-logo-text" id="footer-logo-text">炭火亭</div></div>
```

Also remove the footer logo-mark code from `applyBrandConfig()` (the `footerMark` variable and its update logic).

- [ ] **Step 2: Replace footer brand name text with logo image (#11)**

Update `applyBrandConfig()` footer logo text section to use logo image when available:

```javascript
// ロゴテキスト (footer)
var footerTxt = document.getElementById('footer-logo-text');
if (c.logoTextType === 'image' && c.logoTextValue) {
  footerTxt.innerHTML = '<img src="'+escH(c.logoTextValue)+'" alt="'+escH(c.name)+'" loading="lazy" style="height:32px;object-fit:contain">';
} else if (c.logoMarkType === 'image' && c.logoMarkSrc) {
  // If text logo not set but mark logo exists, show mark logo + text
  footerTxt.innerHTML = '<img src="'+escH(c.logoMarkSrc)+'" alt="'+escH(c.name)+'" loading="lazy" style="height:28px;object-fit:contain;margin-right:8px;vertical-align:middle"><span>'+escH(c.logoTextValue || c.name)+'</span>';
} else {
  footerTxt.textContent = c.logoTextValue || c.name;
}
```

- [ ] **Step 3: Move ニュース・キャンペーン next to 会社情報 (#12)**

Update the footer grid layout. Currently the footer has 4 columns: logo | menu | service | company+news.

Change the footer HTML to put news/campaign as its own column alongside company:

```html
<footer>
  <div class="footer-main">
    <div>
      <div class="footer-logo"><div class="footer-logo-text" id="footer-logo-text">炭火亭</div></div>
      <div class="footer-brand-desc" data-i18n="footer_desc">厳選した国産黒毛和牛を備長炭で焼き上げる本格焼肉。</div>
    </div>
    <!-- メニュー -->
    <div><div class="footer-nav-title" data-i18n="footer_menu">メニュー</div><div class="footer-nav-list"><a href="./weir-brand-menu.html" data-i18n="f_grand_menu">グランドメニュー</a><a href="./weir-brand-menu.html" data-i18n="f_yakiniku">焼肉・特選肉</a><a href="./weir-brand-menu.html" data-i18n="f_rice">ご飯・麺</a><a href="./weir-brand-menu.html" data-i18n="f_drink">ドリンク</a><a href="./weir-brand-menu.html" data-i18n="f_course">コース・プラン</a></div></div>
    <!-- サービス -->
    <div><div class="footer-nav-title" data-i18n="footer_service">サービス</div><div class="footer-nav-list"><a href="javascript:void(0)" data-i18n="cta_reserve" onclick="openResModal()">来店予約</a><a href="./weir-order.html?mode=takeout" data-i18n="cta_takeout">お持ち帰り</a><a href="./weir-order.html?mode=delivery" data-i18n="cta_delivery">デリバリー</a><a href="./weir-membership.html" data-i18n="nav_membership">会員特典</a></div></div>
    <!-- 会社情報 -->
    <div>
      <div class="footer-nav-title" data-i18n="footer_company">会社情報</div>
      <div class="footer-nav-list" id="footer-company-links"></div>
    </div>
    <!-- ニュース・キャンペーン -->
    <div>
      <div class="footer-nav-title" data-i18n="footer_news">ニュース・キャンペーン</div>
      <div class="footer-nav-list"><a href="./weir-brand-news.html" data-i18n="news_more_link">ニュース一覧</a></div>
    </div>
  </div>
  <!-- footer-bottom stays the same -->
</footer>
```

Update the footer CSS grid to 5 columns:
```css
.footer-main{max-width:1100px;margin:0 auto;padding:40px 20px 24px;display:grid;grid-template-columns:180px 1fr 1fr 1fr 1fr;gap:24px}
```

Update responsive breakpoints:
```css
@media(max-width:900px){
  .footer-main{grid-template-columns:1fr 1fr;gap:24px}
}
@media(max-width:600px){
  .footer-main{grid-template-columns:1fr}
}
```

- [ ] **Step 4: Commit**

```bash
git add brand.html
git commit -m "fix: remove footer circle logo, add logo image support, move news column next to company info"
```

---

## Task 10: Floating MO Button Position (Item #13)

**Files:**
- Modify: `brand.html`

- [ ] **Step 1: Adjust floating button position**

Change the CSS for `.float-order` (around line 204):

From:
```css
.float-order{position:fixed;bottom:20px;right:20px;z-index:500}
```

To:
```css
.float-order{position:fixed;bottom:20px;right:15px;z-index:500}
```

- [ ] **Step 2: Commit**

```bash
git add brand.html
git commit -m "fix: move floating MO button 5px left"
```

---

## Task 11: Admin Panel Updates (Item #14)

**Files:**
- Modify: `weir-admin.html`

This task adds 4 new management sections to the admin brand page:
1. Hero carousel image management (in HP設定 tab)
2. Campaign management (new tab)
3. News body editing (in ニュース tab)
4. Custom domain field (in HP設定 tab)

- [ ] **Step 1: Add custom_domain field to HP設定 tab**

In `weir-admin.html`, find the `brand-hp` tab content (around line 1101) and add after the publication status:

```html
<div class="card" style="margin-top:16px">
  <div class="card-title">カスタムドメイン</div>
  <label style="font-size:12px;color:#888;margin-bottom:8px;display:block">ブランド専用ドメインを設定すると、URLに「aiden」が表示されなくなります</label>
  <input type="text" id="brand-custom-domain" placeholder="例: www.example.com" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px">
  <div style="font-size:11px;color:#999;margin-top:6px">※ドメインのDNS設定とVercelのカスタムドメイン追加が別途必要です</div>
</div>
```

- [ ] **Step 2: Add hero carousel management to HP設定 tab**

Add after the custom domain card:

```html
<div class="card" style="margin-top:16px">
  <div class="card-title">ヒーローバナー（カルーセル）</div>
  <div id="hero-slides-list" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px">
    <!-- Populated dynamically -->
  </div>
  <div style="border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;cursor:pointer" onclick="addHeroSlide()">
    📎 画像/動画を追加（ドラッグ&ドロップまたはクリック）
  </div>
  <div style="font-size:11px;color:#999;margin-top:6px">複数枚登録可能。ドラッグで順序変更。5秒間隔で自動スクロールします。</div>
</div>
```

- [ ] **Step 3: Add campaign management tab**

Add a new tab `brand-campaign` to the brand detail page tabs (around line 1097). Insert after the HP設定 tab:

Tab button:
```html
<div class="tab" onclick="switchTab('brand',this,'campaign')">キャンペーン</div>
```

Tab content:
```html
<div class="tab-content" id="brand-campaign">
  <div class="card">
    <div class="card-title">キャンペーン管理</div>
    <button onclick="addCampaign()" style="margin-bottom:12px;padding:8px 16px;background:var(--brand-primary,#1a1a1a);color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer">＋ キャンペーンを追加</button>
    <div id="campaign-list">
      <!-- Populated dynamically: each campaign shows title, image preview, date range, edit/delete buttons -->
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add news body editing to ニュース tab**

Update the news editing modal/form to include a body text area. When the edit button is clicked, show a modal with:

```html
<div class="card" style="margin-top:12px">
  <div class="card-title">記事本文（Markdown対応）</div>
  <textarea id="news-body-editor" rows="12" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:6px;font-family:monospace;font-size:13px;resize:vertical" placeholder="Markdownで本文を入力...&#10;&#10;# 見出し&#10;本文テキスト&#10;&#10;- リスト項目"></textarea>
  <div style="font-size:11px;color:#999;margin-top:4px">Markdown記法が使えます（見出し、太字、リスト、リンクなど）</div>
</div>
```

- [ ] **Step 5: Add save/load functions for new fields**

Add JavaScript functions for:
- `loadBrandHpSettings(brandId)` — loads custom_domain, hero slides from DB
- `saveBrandHpSettings(brandId)` — saves custom_domain, hero slides to DB
- `loadCampaigns(brandId)` — loads campaigns list
- `addCampaign()` / `editCampaign(id)` / `deleteCampaign(id)` — CRUD for campaigns
- `addHeroSlide()` — file picker + upload to Supabase Storage
- `loadNewsBody(newsId)` / `saveNewsBody(newsId)` — load/save news body_html

Each function uses `sb.from('table').select/insert/update/delete` patterns consistent with existing admin code.

- [ ] **Step 6: Commit**

```bash
git add weir-admin.html
git commit -m "feat: add carousel, campaign, news body, and custom domain management to admin"
```

---

## Task 12: Final Integration & Verification

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Fix any issues found.

- [ ] **Step 2: Verify all internal links**

```bash
grep -r "aiden-brand-sushiro" --include="*.html" --include="*.json" . | grep -v ".claude/worktrees" | grep -v "node_modules" | grep -v "test-" | grep -v "qa-"
```

Expected: No results (only test/QA files may have old references).

- [ ] **Step 3: Manual browser verification checklist**

Open `brand.html?brand=ikinari-steak` locally and verify:
- [ ] Header: no circle logo, shows "会員特典"
- [ ] Hero: carousel structure renders (even if no DB slides, shows placeholder)
- [ ] Campaign section: renders from DB or hidden if no campaigns
- [ ] MO buttons: takeout/delivery link to correct URLs with mode param
- [ ] News: items link to brand-news-detail.html
- [ ] Footer: no circle logo, logo image shown, news column next to company
- [ ] Floating button: positioned 5px left (right:15px)
- [ ] All navigation links use brand.html not aiden-brand-sushiro.html

- [ ] **Step 4: Verify news detail page**

Open `brand-news-detail.html?news_id=<valid-id>&brand=ikinari-steak` and verify:
- [ ] Article title, date, category display
- [ ] Body content renders
- [ ] Navigation links work
- [ ] Brand colors apply

- [ ] **Step 5: Verify admin panel**

Open `weir-admin.html`, navigate to brand management, and verify:
- [ ] HP設定 tab: custom domain field visible
- [ ] HP設定 tab: hero carousel management section visible
- [ ] キャンペーン tab: campaign list/add form visible
- [ ] ニュース tab: body editor visible when editing

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore: final integration and verification for brand HP redesign"
```

---

## Post-Implementation: Manual Steps for Taisei

After CC completes the implementation:

1. **Run migration SQL** — Execute `supabase/migrations/20260402000000_brand_hp_redesign.sql` in Supabase SQL Editor
2. **Deploy to Vercel** — `vercel --prod`
3. **Vercel custom domain setup** (when POC store is ready):
   - Vercel Dashboard → Project Settings → Domains → Add domain
   - POC store's DNS: Add CNAME record pointing to `cname.vercel-dns.com`
   - Update `brands.custom_domain` in DB with the domain name
4. **Register hero slides** — Upload images via admin panel
5. **Register campaigns** — Create campaigns via admin panel
6. **Add news body content** — Edit existing news articles to add body text
