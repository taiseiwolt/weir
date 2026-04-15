# Phase 1: 全ページ共通基盤 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全7ページにFOUC制御・共通ヘッダー/フッター・統一i18nを提供する `weir-common.css` + `weir-common.js` を作成し、各ページに統合する

**Architecture:** 外部CSS+JSファイル方式。CSSで初期非表示（opacity:0）、JSでブランドデータ取得→CSS変数適用→ヘッダー/フッターDOM注入→フェードイン。各ページの既存固有ロジック（カルーセル、メニュー、地図、決済等）には手を入れない。

**Tech Stack:** Vanilla JS, CSS Custom Properties, Supabase JS Client v2 (CDN)

**Spec:** `docs/superpowers/specs/2026-04-02-phase1-common-foundation-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `weir-common.css` | FOUC制御、ヘッダーCSS (Type A + B)、フッターCSS、言語セレクトCSS、モバイルナビCSS、レスポンシブ |
| Create | `weir-common.js` | AidenCommon名前空間: escH, resolveBrandId, loadBrand, CSS変数適用, ヘッダー/フッター生成, i18n辞書+changeLang, FOUC完了制御 |
| Modify | `brand.html` | 共通読込追加、重複コード削除（ヘッダー/フッターHTML、CSS、I18N辞書、changeLang、escH、applyBrandConfig一部） |
| Modify | `weir-brand-menu.html` | 同上 |
| Modify | `weir-brand-stores.html` | 同上 |
| Modify | `weir-membership.html` | 共通読込追加、独自ヘッダー→共通ヘッダー、フッター追加、i18n追加 |
| Modify | `weir-order.html` | 共通読込追加、独自ヘッダー→共通MOヘッダー、フッター追加、Supabase初期化追加、LNG辞書→data-i18n移行 |
| Modify | `weir-order-store.html` | 共通読込追加、独自ヘッダー→共通MOヘッダー、フッター追加 |
| Modify | `weir-order-checkout.html` | 共通読込追加、独自ヘッダー→共通MOヘッダー、独自FOUC→共通FOUC、フッター追加 |

---

## Task 1: weir-common.css を作成

**Files:**
- Create: `weir-common.css`

- [ ] **Step 1: FOUC制御CSSを書く**

```css
/* ===== FOUC CONTROL ===== */
body:not(.weir-ready) { opacity: 0; }
body.weir-ready { opacity: 1; transition: opacity .3s ease; }
```

- [ ] **Step 2: ニュートラルCSS変数のデフォルト値を書く**

タイムアウト時（Supabase障害）にニュートラルカラーで表示するためのフォールバック値。各ページの `:root` ハードコード値を置き換える。

```css
/* ===== NEUTRAL DEFAULTS (overridden by JS after brand load) ===== */
:root {
  --brand-primary: #666;
  --brand-primary-dark: #444;
  --brand-primary-light: #f5f5f5;
  --brand-header-bg: #FFFFFF;
  --brand-header-text: #333333;
  --brand-font: 'Noto Sans JP', sans-serif;
  --brand-font-color: #333333;
  --text2: #666; --text3: #999;
  --bg: #fff; --bg2: #F8F8F8;
  --border: #E0E0E0;
  --shadow: 0 2px 8px rgba(0,0,0,.1);
  --gold: #C9A227;
}
```

- [ ] **Step 3: ヘッダー Type A (brand) CSSを書く**

brand.html の lines 50-82 のCSS（`.header`, `.header-main`, `.header-logo`, `.header-logo-text`, `.header-nav`, `.header-nav-link`, `.lang-select-wrap`, `.lang-select`, `.header-hamburger`, `.mobile-nav`, `.mobile-nav-cta`）をそのままコピー。

```css
/* ===== HEADER (shared) ===== */
.header{background:var(--brand-header-bg);position:sticky;top:0;z-index:1000}
.header-main{max-width:1100px;margin:0 auto;display:flex;align-items:center;height:56px;padding:0 20px;gap:0}
.header-logo{margin-right:32px;flex-shrink:0}
.header-logo a{display:flex;align-items:center}
.header-logo-mark{width:44px;height:44px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:10px;flex-shrink:0;overflow:hidden}
.header-logo-mark img{width:100%;height:100%;object-fit:cover;border-radius:50%}
.header-logo-text{color:var(--brand-header-text);font-size:20px;font-weight:700;font-family:'Noto Serif JP',serif;letter-spacing:.05em;white-space:nowrap}
.header-logo-text img{height:32px;object-fit:contain}
.header-nav{display:flex;align-items:center;flex:1}
.header-nav-link{color:var(--brand-header-text);font-size:13px;font-weight:500;padding:0 14px;height:56px;display:flex;align-items:center;white-space:nowrap;transition:background .15s;border:none;background:none;font-family:var(--brand-font);text-decoration:none;cursor:pointer}
.header-nav-link:hover{background:rgba(0,0,0,.15)}
.header-nav-link.active{background:rgba(0,0,0,.1)}
.header-nav-link.cta{background:rgba(0,0,0,.25);border-radius:3px;margin:0 3px;height:38px;font-weight:700;font-size:12px;padding:0 12px}
.header-nav-link.cta:hover{background:rgba(0,0,0,.4)}

/* 言語プルダウン */
.lang-select-wrap{margin-left:auto;position:relative;flex-shrink:0}
.lang-select{appearance:none;-webkit-appearance:none;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);color:var(--brand-header-text);font-size:11px;padding:4px 22px 4px 8px;border-radius:3px;cursor:pointer;font-family:var(--brand-font);outline:none}
.lang-select:hover{background:rgba(255,255,255,.25)}
.lang-select option{background:#333;color:#fff}
.lang-select-arrow{position:absolute;right:6px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--brand-header-text);font-size:9px}

.header-hamburger{display:none;background:none;border:none;color:var(--brand-header-text);font-size:26px;margin-left:auto;padding:8px}

/* ===== MOBILE NAV ===== */
.mobile-nav{display:none;position:fixed;top:56px;left:0;right:0;background:var(--brand-primary-dark);z-index:999;flex-direction:column;padding:8px 0;box-shadow:0 4px 12px rgba(0,0,0,.3)}
.mobile-nav.open{display:flex}
.mobile-nav a,.mobile-nav button{color:white;font-size:14px;padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;align-items:center;gap:10px;background:none;border-left:none;border-right:none;border-top:none;font-family:var(--brand-font);width:100%;text-align:left;cursor:pointer}
.mobile-nav a:hover,.mobile-nav button:hover{background:rgba(0,0,0,.15)}
.mobile-nav-cta{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px}
.mobile-nav-cta a,.mobile-nav-cta button{background:rgba(255,255,255,.15);padding:12px;border-radius:4px;text-align:center;font-weight:700;font-size:13px;border:none;justify-content:center}
```

- [ ] **Step 4: ヘッダー Type B (order) CSSを書く**

MO用ヘッダー。ブランドカラー背景、fixedポジション。

```css
/* ===== HEADER TYPE B (order pages) ===== */
.header--order{position:fixed;top:0;left:0;right:0;z-index:200}
.header--order .header-main{justify-content:space-between}
.header--order .header-back{background:none;border:none;color:var(--brand-header-text);font-size:20px;padding:8px;cursor:pointer;display:flex;align-items:center}
.header--order .header-center{position:absolute;left:50%;transform:translateX(-50%)}
.header--order .header-actions{display:flex;align-items:center;gap:8px}
.header--order .header-cart{position:relative;background:none;border:none;color:var(--brand-header-text);font-size:20px;cursor:pointer;padding:8px}
.header--order .header-cart-badge{position:absolute;top:2px;right:2px;background:white;color:var(--brand-header-bg);font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.header--order .header-signin{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:var(--brand-header-text);font-size:11px;padding:6px 12px;border-radius:3px;cursor:pointer;font-family:var(--brand-font);white-space:nowrap}
.header--order .header-signin:hover{background:rgba(255,255,255,.3)}
/* Order pages need top padding for fixed header */
.weir-order-body{padding-top:56px}
```

- [ ] **Step 5: フッターCSSを書く**

brand.html の lines 197-215 のフッターCSS をコピー。

```css
/* ===== FOOTER ===== */
footer.weir-footer{background:#222;color:rgba(255,255,255,.7)}
.weir-footer .footer-main{max-width:1100px;margin:0 auto;padding:40px 20px 24px;display:grid;grid-template-columns:180px 1fr 1fr 1fr 1fr;gap:24px}
.weir-footer .footer-logo{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.weir-footer .footer-logo-text{font-size:18px;font-weight:700;color:white;font-family:'Noto Serif JP',serif}
.weir-footer .footer-brand-desc{font-size:12px;line-height:1.8;opacity:.6}
.weir-footer .footer-nav-title{font-size:12px;font-weight:700;color:rgba(255,255,255,.9);margin-bottom:12px;letter-spacing:.05em;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.15)}
.weir-footer .footer-nav-list{display:flex;flex-direction:column;gap:9px}
.weir-footer .footer-nav-list a{font-size:12px;color:rgba(255,255,255,.55);transition:color .2s;text-decoration:none}
.weir-footer .footer-nav-list a:hover{color:white}
.weir-footer .footer-bottom{border-top:1px solid rgba(255,255,255,.1);padding:16px 20px}
.weir-footer .footer-bottom-inner{max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.weir-footer .footer-bottom-links{display:flex;gap:16px;flex-wrap:wrap}
.weir-footer .footer-bottom-links a{font-size:11px;color:rgba(255,255,255,.4);text-decoration:none}
.weir-footer .footer-bottom-links a:hover{color:white}
.weir-footer .footer-copyright{font-size:11px;color:rgba(255,255,255,.3)}
.weir-footer .powered{font-size:10px;color:rgba(255,255,255,.2)}
```

- [ ] **Step 6: レスポンシブCSSを書く**

```css
/* ===== RESPONSIVE ===== */
@media(max-width:900px){
  .header-nav{display:none}
  .header-hamburger{display:block}
  .lang-select-wrap{margin-left:0}
  .weir-footer .footer-main{grid-template-columns:1fr 1fr;gap:24px}
}
@media(max-width:600px){
  .weir-footer .footer-main{grid-template-columns:1fr}
  .weir-footer .footer-bottom-inner{flex-direction:column;align-items:flex-start}
  .weir-footer .footer-bottom-links{flex-wrap:wrap}
}
```

- [ ] **Step 7: Commit**

```bash
git add weir-common.css
git commit -m "feat: create weir-common.css with FOUC, header, footer, responsive styles"
```

---

## Task 2: weir-common.js を作成 — コア部分（escH, Supabase, resolveBrandId, loadBrand, CSS変数適用）

**Files:**
- Create: `weir-common.js`

- [ ] **Step 1: AidenCommon 名前空間の骨格と escH を書く**

```javascript
(function() {
  'use strict';

  var SUPABASE_URL = 'https://iikwusprydaogzeslgdz.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC';
  var DEFAULT_BRAND_ID = '22222222-0000-0000-0000-000000000001';
  var TIMEOUT_MS = 3000;

  var sb = null; // lazy init

  function getSb() {
    if (!sb && window.supabase) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return sb;
  }

  function escH(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  window.AidenCommon = {
    brand: null,
    lang: 'ja',
    _options: {},
    _initDone: false,
    escH: escH,
    getSb: getSb,
  };
})();
```

- [ ] **Step 2: resolveBrandId を実装する**

brand.html line 486-506 のロジックをそのまま移植。`weir-common.js` のIIFE内に追加。

```javascript
  async function resolveBrandId() {
    var client = getSb();
    if (!client) return DEFAULT_BRAND_ID;

    // 1. Custom domain (highest priority)
    var hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== 'weir.co.jp' && !hostname.endsWith('.vercel.app')) {
      var { data: domainMatch } = await client.from('brands').select('id').eq('custom_domain', hostname).limit(1);
      if (domainMatch && domainMatch.length > 0) return domainMatch[0].id;
    }

    // 2. URL parameter ?brand=xxx or ?brand_id=xxx
    var params = new URLSearchParams(window.location.search);
    var brandParam = params.get('brand');
    var brandIdParam = params.get('brand_id');

    if (brandIdParam) return brandIdParam;

    if (!brandParam) {
      // 3. sessionStorage fallback
      var stored = sessionStorage.getItem('weir_brand_id');
      if (stored) return stored;
      return DEFAULT_BRAND_ID;
    }

    // Try slug match
    var { data: brandBySlug } = await client.from('brands').select('id').eq('slug', brandParam).limit(1);
    if (brandBySlug && brandBySlug.length > 0) return brandBySlug[0].id;

    // Legacy: store slug prefix
    var prefix = brandParam.split('-')[0];
    var { data } = await client.from('stores').select('brand_id').ilike('slug', prefix + '-%').limit(1);
    if (data && data.length > 0) return data[0].brand_id;
    var { data: exact } = await client.from('stores').select('brand_id').eq('slug', brandParam).limit(1);
    if (exact && exact.length > 0) return exact[0].brand_id;

    return DEFAULT_BRAND_ID;
  }

  window.AidenCommon.resolveBrandId = resolveBrandId;
```

- [ ] **Step 3: loadBrand + applyBrandCSS を実装する**

```javascript
  var BRAND_COLUMNS = 'id, name, slug, memo, font_family, font_color, primary_color, primary_dark, primary_light, header_bg, header_text_color, logo_mark_type, logo_mark_emoji, logo_mark_src, logo_text_type, logo_text_value, sns_line, sns_x, sns_instagram, sns_facebook, sns_tiktok, sns_youtube, sns_threads, company_url, recruit_url, hero_catchphrase, brand_description, custom_domain';

  async function loadBrand(brandId) {
    var client = getSb();
    if (!client) return null;

    var res = await client.from('brands').select(BRAND_COLUMNS).eq('id', brandId).single();
    if (!res.data) return null;

    var b = res.data;
    // Store brand_id in sessionStorage for cross-page persistence
    sessionStorage.setItem('weir_brand_id', b.id);
    return b;
  }

  function applyBrandCSS(brand) {
    var root = document.documentElement;
    if (brand.primary_color)      root.style.setProperty('--brand-primary', brand.primary_color);
    if (brand.primary_dark)       root.style.setProperty('--brand-primary-dark', brand.primary_dark);
    if (brand.primary_light)      root.style.setProperty('--brand-primary-light', brand.primary_light);
    if (brand.header_bg)          root.style.setProperty('--brand-header-bg', brand.header_bg);
    if (brand.header_text_color)  root.style.setProperty('--brand-header-text', brand.header_text_color);
    if (brand.font_color)         root.style.setProperty('--brand-font-color', brand.font_color);
    if (brand.font_family) {
      root.style.setProperty('--brand-font', "'" + brand.font_family + "', sans-serif");
      // Update Google Fonts link
      var fontLink = document.getElementById('font-link');
      if (fontLink) {
        fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(brand.font_family) + ':wght@300;400;500;700&display=swap';
      }
    }
  }

  window.AidenCommon.loadBrand = loadBrand;
  window.AidenCommon.applyBrandCSS = applyBrandCSS;
```

- [ ] **Step 4: Commit**

```bash
git add weir-common.js
git commit -m "feat: create weir-common.js core — escH, resolveBrandId, loadBrand, applyBrandCSS"
```

---

## Task 3: weir-common.js — i18n 実装

**Files:**
- Modify: `weir-common.js`

- [ ] **Step 1: 共通翻訳辞書を追加する**

ヘッダー/フッター/共通UIの翻訳のみ。ページ固有キーは各ページで `addTranslations()` する。brand.html の I18N (line 578-811) から nav_*, footer_*, f_*, cta_* 系のキーを抽出。

```javascript
  var I18N = {
    ja: {
      nav_menu:'メニュー', nav_stores:'お店を探す', nav_membership:'会員特典',
      nav_reserve:'📅 来店予約', nav_order:'🥡 お持ち帰り・デリバリー',
      nav_order_short:'🥡 お持ち帰り',
      footer_desc:'', // brand.brand_description で上書き
      footer_menu:'メニュー', footer_service:'サービス', footer_company:'企業情報',
      footer_news:'ニュース・キャンペーン', footer_recruit:'採用情報',
      f_grand_menu:'グランドメニュー', f_yakiniku:'焼肉・特選肉', f_rice:'ご飯・麺',
      f_drink:'ドリンク', f_course:'コース・プラン',
      cta_reserve:'来店予約', cta_takeout:'お持ち帰り', cta_delivery:'デリバリー',
      f_faq:'よくあるご質問', f_contact:'お問い合わせ', f_recruit:'採用情報',
      f_privacy:'プライバシーポリシー', f_terms:'利用規約', f_sitemap:'サイトマップ',
      news_more_link:'ニュース一覧',
      lang_label:'言語/Language',
      signin:'サインイン', cart:'カート', back:'戻る',
    },
    en: {
      nav_menu:'Menu', nav_stores:'Find a Store', nav_membership:'Member Benefits',
      nav_reserve:'📅 Reservation', nav_order:'🥡 Takeout / Delivery',
      nav_order_short:'🥡 Takeout',
      footer_desc:'',
      footer_menu:'Menu', footer_service:'Services', footer_company:'Company',
      footer_news:'News & Campaigns', footer_recruit:'Careers',
      f_grand_menu:'Grand Menu', f_yakiniku:'Yakiniku & Select Cuts', f_rice:'Rice & Noodles',
      f_drink:'Drinks', f_course:'Course Plans',
      cta_reserve:'Reservation', cta_takeout:'Takeout', cta_delivery:'Delivery',
      f_faq:'FAQ', f_contact:'Contact Us', f_recruit:'Careers',
      f_privacy:'Privacy Policy', f_terms:'Terms of Use', f_sitemap:'Sitemap',
      news_more_link:'See All News',
      lang_label:'言語/Language',
      signin:'Sign In', cart:'Cart', back:'Back',
    },
    zh: {
      nav_menu:'菜单', nav_stores:'查找门店', nav_membership:'会员特典',
      nav_reserve:'📅 预约', nav_order:'🥡 外带·外送',
      nav_order_short:'🥡 外带',
      footer_desc:'',
      footer_menu:'菜单', footer_service:'服务', footer_company:'公司信息',
      footer_news:'新闻・活动', footer_recruit:'招聘信息',
      f_grand_menu:'完整菜单', f_yakiniku:'烤肉·精选肉', f_rice:'米饭·面食',
      f_drink:'饮品', f_course:'套餐',
      cta_reserve:'预约', cta_takeout:'外带', cta_delivery:'外送',
      f_faq:'常见问题', f_contact:'联系我们', f_recruit:'招聘信息',
      f_privacy:'隐私政策', f_terms:'使用条款', f_sitemap:'网站地图',
      news_more_link:'查看全部新闻',
      lang_label:'言語/Language',
      signin:'登录', cart:'购物车', back:'返回',
    },
    ko: {
      nav_menu:'메뉴', nav_stores:'매장 찾기', nav_membership:'회원 혜택',
      nav_reserve:'📅 예약', nav_order:'🥡 포장·배달',
      nav_order_short:'🥡 포장',
      footer_desc:'',
      footer_menu:'메뉴', footer_service:'서비스', footer_company:'기업 정보',
      footer_news:'뉴스・캠페인', footer_recruit:'채용 정보',
      f_grand_menu:'전체 메뉴', f_yakiniku:'야키니쿠·특선육', f_rice:'밥·면',
      f_drink:'음료', f_course:'코스 플랜',
      cta_reserve:'예약', cta_takeout:'포장', cta_delivery:'배달',
      f_faq:'자주 묻는 질문', f_contact:'문의하기', f_recruit:'채용 정보',
      f_privacy:'개인정보 처리방침', f_terms:'이용약관', f_sitemap:'사이트맵',
      news_more_link:'뉴스 전체 보기',
      lang_label:'言語/Language',
      signin:'로그인', cart:'장바구니', back:'뒤로',
    },
    fr: {
      nav_menu:'Menu', nav_stores:'Trouver un restaurant', nav_membership:'Avantages membres',
      nav_reserve:'📅 Réservation', nav_order:'🥡 À emporter / Livraison',
      nav_order_short:'🥡 À emporter',
      footer_desc:'',
      footer_menu:'Menu', footer_service:'Services', footer_company:'Entreprise',
      footer_news:'Actualités & Campagnes', footer_recruit:'Recrutement',
      f_grand_menu:'Grand Menu', f_yakiniku:'Yakiniku & Viandes', f_rice:'Riz & Nouilles',
      f_drink:'Boissons', f_course:'Menus & Formules',
      cta_reserve:'Réservation', cta_takeout:'À emporter', cta_delivery:'Livraison',
      f_faq:'FAQ', f_contact:'Contact', f_recruit:'Recrutement',
      f_privacy:'Politique de confidentialité', f_terms:"Conditions d'utilisation", f_sitemap:'Plan du site',
      news_more_link:'Voir toutes les actualités',
      lang_label:'言語/Language',
      signin:'Connexion', cart:'Panier', back:'Retour',
    },
    it: {
      nav_menu:'Menu', nav_stores:'Trova un ristorante', nav_membership:'Vantaggi membri',
      nav_reserve:'📅 Prenotazione', nav_order:'🥡 Asporto / Consegna',
      nav_order_short:'🥡 Asporto',
      footer_desc:'',
      footer_menu:'Menu', footer_service:'Servizi', footer_company:'Azienda',
      footer_news:'Notizie & Campagne', footer_recruit:'Lavora con noi',
      f_grand_menu:'Menu Completo', f_yakiniku:'Yakiniku & Carni', f_rice:'Riso & Noodle',
      f_drink:'Bevande', f_course:'Menu & Formule',
      cta_reserve:'Prenotazione', cta_takeout:'Asporto', cta_delivery:'Consegna',
      f_faq:'FAQ', f_contact:'Contatti', f_recruit:'Lavora con noi',
      f_privacy:'Privacy Policy', f_terms:'Termini di utilizzo', f_sitemap:'Mappa del sito',
      news_more_link:'Tutte le notizie',
      lang_label:'言語/Language',
      signin:'Accedi', cart:'Carrello', back:'Indietro',
    },
    id: {
      nav_menu:'Menu', nav_stores:'Cari Restoran', nav_membership:'Keuntungan Member',
      nav_reserve:'📅 Reservasi', nav_order:'🥡 Bawa Pulang / Pesan Antar',
      nav_order_short:'🥡 Bawa Pulang',
      footer_desc:'',
      footer_menu:'Menu', footer_service:'Layanan', footer_company:'Perusahaan',
      footer_news:'Berita & Kampanye', footer_recruit:'Karir',
      f_grand_menu:'Menu Lengkap', f_yakiniku:'Yakiniku & Pilihan Daging', f_rice:'Nasi & Mie',
      f_drink:'Minuman', f_course:'Paket Kursus',
      cta_reserve:'Reservasi', cta_takeout:'Bawa Pulang', cta_delivery:'Pesan Antar',
      f_faq:'FAQ', f_contact:'Hubungi Kami', f_recruit:'Karir',
      f_privacy:'Kebijakan Privasi', f_terms:'Syarat Penggunaan', f_sitemap:'Peta Situs',
      news_more_link:'Lihat Semua Berita',
      lang_label:'言語/Language',
      signin:'Masuk', cart:'Keranjang', back:'Kembali',
    }
  };

  window.AidenCommon.I18N = I18N;
```

- [ ] **Step 2: addTranslations と changeLang を実装する**

```javascript
  function addTranslations(dict) {
    // dict format: { key: { ja: '...', en: '...', ... } }
    Object.keys(dict).forEach(function(key) {
      Object.keys(dict[key]).forEach(function(lang) {
        if (!I18N[lang]) I18N[lang] = {};
        I18N[lang][key] = dict[key][lang];
      });
    });
  }

  function t(key) {
    var dict = I18N[AidenCommon.lang];
    if (dict && dict[key] !== undefined) return dict[key];
    var ja = I18N.ja;
    if (ja && ja[key] !== undefined) return ja[key];
    return key;
  }

  function changeLang(lang) {
    if (!I18N[lang]) return;
    AidenCommon.lang = lang;
    sessionStorage.setItem('weir_lang', lang);

    var dict = I18N[lang];
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        if (el.tagName === 'INPUT') {
          el.placeholder = dict[key];
        } else {
          el.innerHTML = escH(dict[key]).replace(/\n/g, '<br>');
        }
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.placeholder = dict[key];
    });

    // Update html lang attribute
    var htmlRoot = document.getElementById('html-root') || document.documentElement;
    htmlRoot.lang = lang;

    // Sync language selector
    var selects = document.querySelectorAll('.lang-select');
    selects.forEach(function(sel) { sel.value = lang; });
  }

  window.AidenCommon.addTranslations = addTranslations;
  window.AidenCommon.t = t;
  window.AidenCommon.changeLang = changeLang;
```

- [ ] **Step 3: Commit**

```bash
git add weir-common.js
git commit -m "feat: add i18n system to weir-common.js — 7-language dictionary, changeLang, addTranslations"
```

---

## Task 4: weir-common.js — ヘッダー/フッター生成 + init()

**Files:**
- Modify: `weir-common.js`

- [ ] **Step 1: renderHeader (Type A: brand) を実装する**

```javascript
  function renderHeaderBrand(brand) {
    var slug = brand.slug || '';
    var brandParam = slug ? '?brand=' + encodeURIComponent(slug) : '';
    var brandIdParam = brand.id ? '?brand_id=' + encodeURIComponent(brand.id) : '';

    // Determine active page
    var path = window.location.pathname;
    var isMenu = path.indexOf('brand-menu') >= 0;
    var isStores = path.indexOf('brand-stores') >= 0;
    var isMembership = path.indexOf('membership') >= 0;

    // Logo HTML
    var logoHtml = '';
    if (brand.logo_text_type === 'image' && brand.logo_text_value) {
      logoHtml = '<img src="' + escH(brand.logo_text_value) + '" alt="' + escH(brand.name) + '" loading="lazy">';
    } else {
      logoHtml = escH(brand.logo_text_value || brand.name);
    }

    var headerEl = document.getElementById('weir-header');
    if (!headerEl) return;

    headerEl.innerHTML =
      '<header class="header">' +
        '<div class="header-main">' +
          '<div class="header-logo">' +
            '<a href="./brand.html' + brandParam + '">' +
              '<span style="display:flex;align-items:center;gap:10px">' +
                '<span class="header-logo-text" id="logo-text">' + logoHtml + '</span>' +
              '</span>' +
            '</a>' +
          '</div>' +
          '<nav class="header-nav">' +
            '<a href="./weir-brand-menu.html' + brandParam + '" class="header-nav-link' + (isMenu ? ' active' : '') + '" data-i18n="nav_menu">' + t('nav_menu') + '</a>' +
            '<a href="./weir-brand-stores.html' + brandParam + '" class="header-nav-link' + (isStores ? ' active' : '') + '" data-i18n="nav_stores">' + t('nav_stores') + '</a>' +
            '<a href="./weir-membership.html' + brandIdParam + '" class="header-nav-link' + (isMembership ? ' active' : '') + '" data-i18n="nav_membership">' + t('nav_membership') + '</a>' +
            '<a href="javascript:void(0)" class="header-nav-link cta" data-i18n="nav_reserve" onclick="if(window.openResModal)openResModal()">' + t('nav_reserve') + '</a>' +
            '<a href="./weir-order.html' + brandParam + '" class="header-nav-link cta" data-i18n="nav_order">' + t('nav_order') + '</a>' +
          '</nav>' +
          '<div class="lang-select-wrap">' +
            '<select class="lang-select" id="lang-select" onchange="AidenCommon.changeLang(this.value)">' +
              '<option value="ja">' + t('lang_label') + '</option>' +
              '<option value="ja">日本語</option>' +
              '<option value="en">English</option>' +
              '<option value="zh">中文</option>' +
              '<option value="ko">한국어</option>' +
              '<option value="fr">français</option>' +
              '<option value="it">Italiano</option>' +
              '<option value="id">Bahasa Indonesia</option>' +
            '</select>' +
            '<span class="lang-select-arrow">▼</span>' +
          '</div>' +
          '<button class="header-hamburger" id="hamburger" onclick="AidenCommon.toggleNav()">☰</button>' +
        '</div>' +
      '</header>' +
      '<div class="mobile-nav" id="mobile-nav">' +
        '<div class="mobile-nav-cta">' +
          '<a href="javascript:void(0)" data-i18n="nav_reserve" onclick="if(window.openResModal)openResModal()">📅 ' + t('cta_reserve') + '</a>' +
          '<a href="./weir-order.html' + brandParam + '&mode=takeout" data-i18n="nav_order_short">' + t('nav_order_short') + '</a>' +
          '<a href="./weir-order.html' + brandParam + '&mode=delivery">🛵 ' + t('cta_delivery') + '</a>' +
        '</div>' +
        '<a href="./weir-brand-menu.html' + brandParam + '" data-i18n="nav_menu">📖 ' + t('nav_menu') + '</a>' +
        '<a href="./weir-brand-stores.html' + brandParam + '" data-i18n="nav_stores">📍 ' + t('nav_stores') + '</a>' +
        '<a href="./weir-membership.html' + brandIdParam + '" data-i18n="nav_membership">🏆 ' + t('nav_membership') + '</a>' +
      '</div>';
  }
```

- [ ] **Step 2: renderHeader (Type B: order) を実装する**

```javascript
  function renderHeaderOrder(brand) {
    var headerEl = document.getElementById('weir-header');
    if (!headerEl) return;

    var logoHtml = '';
    if (brand.logo_text_type === 'image' && brand.logo_text_value) {
      logoHtml = '<img src="' + escH(brand.logo_text_value) + '" alt="' + escH(brand.name) + '" loading="lazy">';
    } else {
      logoHtml = escH(brand.logo_text_value || brand.name);
    }

    headerEl.innerHTML =
      '<header class="header header--order">' +
        '<div class="header-main">' +
          '<button class="header-back" id="weir-header-back" onclick="if(AidenCommon._options.onBack)AidenCommon._options.onBack();else history.back()">←</button>' +
          '<div class="header-center">' +
            '<span class="header-logo-text">' + logoHtml + '</span>' +
          '</div>' +
          '<div class="header-actions">' +
            '<div class="lang-select-wrap">' +
              '<select class="lang-select" id="lang-select" onchange="AidenCommon.changeLang(this.value)">' +
                '<option value="ja">' + t('lang_label') + '</option>' +
                '<option value="ja">日本語</option>' +
                '<option value="en">English</option>' +
                '<option value="zh">中文</option>' +
                '<option value="ko">한국어</option>' +
                '<option value="fr">français</option>' +
                '<option value="it">Italiano</option>' +
                '<option value="id">Bahasa Indonesia</option>' +
              '</select>' +
              '<span class="lang-select-arrow">▼</span>' +
            '</div>' +
            '<button class="header-cart" id="weir-header-cart" style="display:none">🛒<span class="header-cart-badge" id="weir-cart-badge">0</span></button>' +
            '<button class="header-signin" id="weir-header-signin" data-i18n="signin">' + t('signin') + '</button>' +
          '</div>' +
        '</div>' +
      '</header>';

    // Add body padding for fixed header
    document.body.classList.add('weir-order-body');
  }
```

- [ ] **Step 3: renderFooter を実装する**

```javascript
  function renderFooter(brand) {
    var footerEl = document.getElementById('weir-footer');
    if (!footerEl) return;

    var slug = brand.slug || '';
    var brandParam = slug ? '?brand=' + encodeURIComponent(slug) : '';
    var brandIdParam = brand.id ? '?brand_id=' + encodeURIComponent(brand.id) : '';

    var logoHtml = '';
    if (brand.logo_text_type === 'image' && brand.logo_text_value) {
      logoHtml = '<img src="' + escH(brand.logo_text_value) + '" alt="' + escH(brand.name) + '" loading="lazy" style="height:32px;object-fit:contain">';
    } else if (brand.logo_mark_type === 'image' && brand.logo_mark_src) {
      logoHtml = '<img src="' + escH(brand.logo_mark_src) + '" alt="' + escH(brand.name) + '" loading="lazy" style="height:28px;object-fit:contain;margin-right:8px;vertical-align:middle"><span>' + escH(brand.logo_text_value || brand.name) + '</span>';
    } else {
      logoHtml = escH(brand.logo_text_value || brand.name);
    }

    // Company links (dynamic)
    var companyLinks = '';
    if (brand.company_url) companyLinks += '<a href="' + escH(brand.company_url) + '" target="_blank" rel="noopener">' + t('footer_company') + '</a>';
    if (brand.recruit_url) companyLinks += '<a href="' + escH(brand.recruit_url) + '" target="_blank" rel="noopener">' + t('f_recruit') + '</a>';
    companyLinks += '<a href="mailto:support@weir.co.jp" data-i18n="f_contact">' + t('f_contact') + '</a>';
    companyLinks += '<a href="javascript:void(0)" data-i18n="f_faq">' + t('f_faq') + '</a>';

    var year = new Date().getFullYear();

    footerEl.innerHTML =
      '<footer class="weir-footer">' +
        '<div class="footer-main">' +
          '<div>' +
            '<div class="footer-logo"><div class="footer-logo-text" id="footer-logo-text">' + logoHtml + '</div></div>' +
            '<div class="footer-brand-desc" data-i18n="footer_desc">' + escH(brand.brand_description || '') + '</div>' +
          '</div>' +
          '<div><div class="footer-nav-title" data-i18n="footer_menu">' + t('footer_menu') + '</div>' +
            '<div class="footer-nav-list" id="footer-menu-links">' +
              '<a href="./weir-brand-menu.html' + brandParam + '" data-i18n="f_grand_menu">' + t('f_grand_menu') + '</a>' +
              '<a href="./weir-brand-menu.html' + brandParam + '" data-i18n="f_yakiniku">' + t('f_yakiniku') + '</a>' +
              '<a href="./weir-brand-menu.html' + brandParam + '" data-i18n="f_rice">' + t('f_rice') + '</a>' +
              '<a href="./weir-brand-menu.html' + brandParam + '" data-i18n="f_drink">' + t('f_drink') + '</a>' +
              '<a href="./weir-brand-menu.html' + brandParam + '" data-i18n="f_course">' + t('f_course') + '</a>' +
            '</div>' +
          '</div>' +
          '<div><div class="footer-nav-title" data-i18n="footer_service">' + t('footer_service') + '</div>' +
            '<div class="footer-nav-list">' +
              '<a href="javascript:void(0)" data-i18n="cta_reserve" onclick="if(window.openResModal)openResModal()">' + t('cta_reserve') + '</a>' +
              '<a href="./weir-order.html' + brandParam + '&mode=takeout" data-i18n="cta_takeout">' + t('cta_takeout') + '</a>' +
              '<a href="./weir-order.html' + brandParam + '&mode=delivery" data-i18n="cta_delivery">' + t('cta_delivery') + '</a>' +
              '<a href="./weir-membership.html' + brandIdParam + '" data-i18n="nav_membership">' + t('nav_membership') + '</a>' +
            '</div>' +
          '</div>' +
          '<div><div class="footer-nav-title" data-i18n="footer_company">' + t('footer_company') + '</div>' +
            '<div class="footer-nav-list" id="footer-company-links">' + companyLinks + '</div>' +
          '</div>' +
          '<div><div class="footer-nav-title" data-i18n="footer_news">' + t('footer_news') + '</div>' +
            '<div class="footer-nav-list"><a href="./weir-brand-news.html' + brandParam + '" data-i18n="news_more_link">' + t('news_more_link') + '</a></div>' +
          '</div>' +
        '</div>' +
        '<div class="footer-bottom"><div class="footer-bottom-inner">' +
          '<span class="footer-copyright">© ' + year + ' ' + escH(brand.name) + ' All rights reserved.</span>' +
          '<div class="footer-bottom-links">' +
            '<a href="/weir-tokushoho.html">特定商取引法に基づく表示</a>' +
            '<a href="./legal/privacy.html" data-i18n="f_privacy">' + t('f_privacy') + '</a>' +
            '<a href="./legal/terms.html" data-i18n="f_terms">' + t('f_terms') + '</a>' +
            '<a href="./legal/refund.html">返金ポリシー</a>' +
            '<a href="./weir-sitemap.html" data-i18n="f_sitemap">' + t('f_sitemap') + '</a>' +
            '<a href="mailto:support@weir.co.jp">' + t('f_contact') + '</a>' +
          '</div>' +
          '<span class="powered">Powered by Weir</span>' +
        '</div></div>' +
      '</footer>';
  }
```

- [ ] **Step 4: toggleNav ヘルパーを追加する**

```javascript
  function toggleNav() {
    var nav = document.getElementById('mobile-nav');
    var btn = document.getElementById('hamburger');
    if (nav) {
      nav.classList.toggle('open');
      if (btn) btn.textContent = nav.classList.contains('open') ? '✕' : '☰';
    }
  }

  // Close mobile nav on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#mobile-nav') && !e.target.closest('#hamburger')) {
      var nav = document.getElementById('mobile-nav');
      if (nav) {
        nav.classList.remove('open');
        var btn = document.getElementById('hamburger');
        if (btn) btn.textContent = '☰';
      }
    }
  });

  window.AidenCommon.toggleNav = toggleNav;
  window.AidenCommon.renderFooter = renderFooter;
```

- [ ] **Step 5: init() を実装する**

```javascript
  async function init(options) {
    if (AidenCommon._initDone) return;
    AidenCommon._initDone = true;
    AidenCommon._options = options || {};

    // Restore language from sessionStorage
    var savedLang = sessionStorage.getItem('weir_lang');
    if (savedLang && I18N[savedLang]) AidenCommon.lang = savedLang;

    // Race: brand load vs timeout
    var brandLoaded = false;
    var timeoutId = setTimeout(function() {
      if (!brandLoaded) {
        // Timeout: show with neutral colors (CSS defaults), no brand applied
        document.body.classList.add('weir-ready');
      }
    }, TIMEOUT_MS);

    try {
      var brandId = await resolveBrandId();
      var brand = await loadBrand(brandId);

      brandLoaded = true;
      clearTimeout(timeoutId);

      if (brand) {
        AidenCommon.brand = brand;
        applyBrandCSS(brand);

        // Render header
        if (options.header === 'brand') {
          renderHeaderBrand(brand);
        } else if (options.header === 'order') {
          renderHeaderOrder(brand);
        }

        // Render footer
        if (options.footer) {
          renderFooter(brand);
        }

        // Apply saved language
        if (AidenCommon.lang !== 'ja') {
          changeLang(AidenCommon.lang);
        }

        // Callback
        if (options.onBrandLoaded) {
          options.onBrandLoaded(brand);
        }
      }
    } catch (e) {
      console.error('[AidenCommon] init error:', e);
    }

    // Always show page
    document.body.classList.add('weir-ready');
  }

  window.AidenCommon.init = init;
```

- [ ] **Step 6: Commit**

```bash
git add weir-common.js
git commit -m "feat: add header/footer rendering and init() to weir-common.js"
```

---

## Task 5: brand.html に共通基盤を統合する

**Files:**
- Modify: `brand.html`

**重要:** brand.htmlはHP修正で大幅に変更されている。固有ロジック（カルーセル、キャンペーン、ニュース、来店予約モーダル、SNS等）には手を入れない。

- [ ] **Step 1: `<head>` に共通CSS/JSの読込を追加する**

brand.html の `<head>` 内、Supabase CDN の `<script>` タグの直後（line 19の後）に追加:

```html
<link rel="stylesheet" href="./weir-common.css">
<script src="./weir-common.js"></script>
```

- [ ] **Step 2: ヘッダーHTMLをプレースホルダーに置き換える**

brand.html の lines 293-340 の `<header>...</header>` と `<div class="mobile-nav">...</div>` を以下に置き換え:

```html
<!-- ===== HEADER (rendered by weir-common.js) ===== -->
<div id="weir-header"></div>
```

- [ ] **Step 3: フッターHTMLをプレースホルダーに置き換える**

brand.html の lines 445-469 の `<footer>...</footer>` を以下に置き換え:

```html
<!-- ===== FOOTER (rendered by weir-common.js) ===== -->
<div id="weir-footer"></div>
```

- [ ] **Step 4: 重複CSSを削除する**

brand.html の `<style>` ブロックから以下のCSSセクションを削除:
- `:root { ... }` ブロック (lines 25-41) — weir-common.css のニュートラルデフォルトに置き換え
- `/* ===== HEADER ===== */` ～ `.mobile-nav-cta` (lines 50-82) — weir-common.css に移動済み
- `/* ===== FOOTER ===== */` ～ `.powered` (lines 197-215) — weir-common.css に移動済み
- `@media` 内のヘッダー/フッター関連（`.header-nav{display:none}`, `.header-hamburger{display:block}`, `.footer-main` のgrid変更） — weir-common.css に移動済み

**残す:** `:root` ブロック以外の `*{box-sizing...}` 以降のベースCSS、ヒーロー、キャンペーン、CTA、店舗検索、予約モーダル等のCSS。

- [ ] **Step 5: 重複JSを削除する**

brand.html の `<script>` から以下を削除:
- `function escH(s){...}` (line 477) — AidenCommon.escH を使用
- `var I18N = { ... };` (lines 578-811) — AidenCommon.I18N に統合
- `var currentLang = 'ja';` (line 813)
- `function changeLang(lang){...}` (lines 815-828) — AidenCommon.changeLang を使用
- `function toggleNav(){...}` と外部クリックハンドラ (lines 981-990) — AidenCommon.toggleNav に統合
- `var BRAND_CONFIG = {...}` (lines 538-576) 内の重複フィールド — loadBrand で取得

**残す:**
- Supabase初期化 (`const sb = ...`) — ページ固有クエリで使用
- `resolveBrandId()` — 削除してAidenCommon版を使う
- `applyBrandConfig()` — ロゴ更新・ページタイトル・ガイドタイトル等のDOM操作は残す（CSS変数設定部分だけ削除）
- `loadFromSupabase()` — カルーセル/キャンペーン/ストア/ニュース読込は残す
- SNS, 予約モーダル, その他全ての固有ロジック

- [ ] **Step 6: init() 呼び出しを追加し、loadFromSupabase を統合する**

brand.html の DOMContentLoaded ハンドラ内（既存の `loadFromSupabase()` 呼出しの前）に追加:

```javascript
// Initialize common foundation
await AidenCommon.init({
  header: 'brand',
  footer: true,
  onBrandLoaded: function(brand) {
    // Update page-specific elements with brand data
    // (hero catchphrase, guide title, page title, SNS, etc.)
    BRAND_CONFIG.name = brand.name || BRAND_CONFIG.name;
    BRAND_CONFIG.fontFamily = brand.font_family || BRAND_CONFIG.fontFamily;
    BRAND_CONFIG.logoMarkType = brand.logo_mark_type || 'emoji';
    BRAND_CONFIG.logoMarkEmoji = brand.logo_mark_emoji || '';
    BRAND_CONFIG.logoMarkSrc = brand.logo_mark_src || '';
    BRAND_CONFIG.logoTextType = brand.logo_text_type || 'text';
    BRAND_CONFIG.logoTextValue = brand.logo_text_value || '';
    BRAND_CONFIG.primaryColor = brand.primary_color || BRAND_CONFIG.primaryColor;
    BRAND_CONFIG.primaryDark = brand.primary_dark || BRAND_CONFIG.primaryDark;
    BRAND_CONFIG.primaryLight = brand.primary_light || BRAND_CONFIG.primaryLight;
    BRAND_CONFIG.headerBg = brand.header_bg || BRAND_CONFIG.headerBg;
    BRAND_CONFIG.headerTextColor = brand.header_text_color || BRAND_CONFIG.headerTextColor;
    BRAND_CONFIG.fontColor = brand.font_color || BRAND_CONFIG.fontColor;
    BRAND_CONFIG.sns = {
      line: brand.sns_line || '', x: brand.sns_x || '',
      instagram: brand.sns_instagram || '', facebook: brand.sns_facebook || '',
      tiktok: brand.sns_tiktok || '', youtube: brand.sns_youtube || '',
      threads: brand.sns_threads || ''
    };
    BRAND_CONFIG.companyUrl = brand.company_url || '';
    BRAND_CONFIG.recruitUrl = brand.recruit_url || '';
    BRAND_CONFIG.brandDescription = brand.brand_description || '';
    if (brand.hero_catchphrase) {
      var heroEl = document.getElementById('hero-catch');
      if (heroEl) heroEl.textContent = brand.hero_catchphrase;
    }
    // Page title
    document.title = brand.name;
    // Guide section title
    var guideTitle = document.querySelector('.guide-section .sec-title');
    if (guideTitle) guideTitle.textContent = brand.name + 'からのご案内';
  }
});

// escH reference for page-specific code
var escH = AidenCommon.escH;
```

既存の `loadFromSupabase()` から brandデータ取得部分（lines 1002-1039）の `resolveBrandId()` 呼出しと `brands` テーブルクエリを削除し、代わりに `AidenCommon.brand` を使用するように変更する。カルーセル、キャンペーン、ストア、ニュース読込はそのまま残すが、`brandId` は `AidenCommon.brand.id` を使う。

- [ ] **Step 7: ページ固有翻訳を addTranslations で追加する**

brand.html に残す翻訳キー（ヘッダー/フッター以外のページ固有キー）を `AidenCommon.addTranslations()` で追加。init() 呼び出しの前に配置:

```javascript
AidenCommon.addTranslations({
  hero_catch: { ja:'うまい肉を、炭火で。\nうまい肉で、心も一杯。', en:'Great meat, charcoal-grilled.\nGreat meat, full hearts.', zh:'好肉，炭火烤。\n好肉，满足每一刻。', ko:'맛있는 고기를, 숯불로.\n맛있는 고기로, 마음도 가득.', fr:'Bonne viande, au charbon de bois.\nBonne viande, cœur comblé.', it:'Carne buona, alla brace.\nCarne buona, cuore pieno.', id:'Daging enak, dibakar arang.\nDaging enak, hati penuh.' },
  hero_btn: { ja:'🔥 炭火亭のこだわり', en:'🔥 Our Commitment', zh:'🔥 我们的坚持', ko:'🔥 숯불정의 고집', fr:'🔥 Notre engagement', it:'🔥 Il nostro impegno', id:'🔥 Komitmen Kami' },
  sec_campaign: { ja:'キャンペーン', en:'Campaigns', zh:'活动', ko:'캠페인', fr:'Campagnes', it:'Campagne', id:'Kampanye' },
  season_title: { ja:'🌸 春の定番商品', en:'🌸 Spring Classics', zh:'🌸 春季限定', ko:'🌸 봄 한정 메뉴', fr:'🌸 Spécialités de saison', it:'🌸 Stagionale', id:'🌸 Menu Musiman' },
  // ... remaining page-specific keys from the I18N object
  // (season_sub, season_more, store_search_title, store_search_placeholder, search_btn,
  //  guide_title, news_title, news_more, sns_title, sns_sub,
  //  guide1-guide4, cat_store, cat_corp, cat_menu,
  //  sidebar_job, sidebar_job_sub, sidebar_land, sidebar_land_sub,
  //  news1-news5, area_tokyo through area_all)
});
```

**注意:** 全7言語の全ページ固有キーを含める。省略せず完全な辞書を書くこと。

- [ ] **Step 8: 動作確認**

Run: ブラウザで `brand.html?brand=sumibite` を開く
Expected:
1. FOUCなし（白→ブランドカラーではなく、非表示→ブランドカラーで表示）
2. ヘッダーが正しいブランドカラーで表示
3. ナビリンクが機能する
4. 言語切替が動作する
5. フッターが表示される
6. カルーセル/キャンペーン/ニュース等の固有機能が動作する

- [ ] **Step 9: Commit**

```bash
git add brand.html
git commit -m "refactor: integrate aiden-common into brand.html — shared header/footer/i18n/FOUC"
```

---

## Task 6: weir-brand-menu.html に共通基盤を統合する

**Files:**
- Modify: `weir-brand-menu.html`

- [ ] **Step 1: 現在のファイルの構造を確認する**

Run: weir-brand-menu.html のヘッダー/フッター/I18N/changeLang/escH/loadBrandConfig の行番号を確認

- [ ] **Step 2: `<head>` に共通CSS/JS読込を追加する**

Supabase CDNの `<script>` タグの直後に追加:
```html
<link rel="stylesheet" href="./weir-common.css">
<script src="./weir-common.js"></script>
```

- [ ] **Step 3: ヘッダーHTML → プレースホルダー、フッターHTML → プレースホルダー**

既存の `<header>...</header>` + `<div class="mobile-nav">...</div>` を `<div id="weir-header"></div>` に置き換え。
既存の `<footer>...</footer>` を `<div id="weir-footer"></div>` に置き換え。

- [ ] **Step 4: 重複CSS/JSを削除**

Task 5 と同じパターン:
- `:root` CSS変数、ヘッダーCSS、フッターCSS、レスポンシブ内のヘッダー/フッター分を削除
- `escH()`, `I18N`, `changeLang()`, `toggleNav()`, `loadBrandConfig()` / `applyBrand()` のCSS変数設定部分を削除

- [ ] **Step 5: init() 呼び出し + ページ固有翻訳を追加**

```javascript
AidenCommon.addTranslations({
  page_title: { ja:'メニュー', en:'Menu', zh:'菜单', ko:'메뉴' },
  // ... weir-brand-menu.html 固有の翻訳キー
});

await AidenCommon.init({
  header: 'brand',
  footer: true,
  onBrandLoaded: function(brand) {
    // Page title
    document.title = brand.name + ' | メニュー';
    // Menu-specific brand data usage (if any)
  }
});
var escH = AidenCommon.escH;
```

ページ固有の `resolveBrandId` 呼出し → `AidenCommon.brand.id` に変更。

- [ ] **Step 6: 動作確認 + Commit**

```bash
git add weir-brand-menu.html
git commit -m "refactor: integrate aiden-common into weir-brand-menu.html"
```

---

## Task 7: weir-brand-stores.html に共通基盤を統合する

**Files:**
- Modify: `weir-brand-stores.html`

手順は Task 6 と同一パターン。

- [ ] **Step 1: 現在のファイルの構造を確認する**
- [ ] **Step 2: `<head>` に共通CSS/JS読込を追加する**
- [ ] **Step 3: ヘッダー/フッターHTML → プレースホルダー**
- [ ] **Step 4: 重複CSS/JSを削除**

特記: このページは `I18N_STORES`（変数名が異なる）を使用。`changeLang()` も独自実装。両方とも削除して共通版に移行。

- [ ] **Step 5: init() 呼び出し + ページ固有翻訳**

```javascript
AidenCommon.addTranslations({
  // weir-brand-stores.html 固有の翻訳キー
  // 検索関連、フィルター、地図、アクセス等
});

await AidenCommon.init({
  header: 'brand',
  footer: true,
  onBrandLoaded: function(brand) {
    document.title = brand.name + ' | 店舗一覧';
  }
});
var escH = AidenCommon.escH;
```

- [ ] **Step 6: 動作確認 + Commit**

```bash
git add weir-brand-stores.html
git commit -m "refactor: integrate aiden-common into weir-brand-stores.html"
```

---

## Task 8: weir-membership.html に共通基盤を統合する

**Files:**
- Modify: `weir-membership.html`

このページは現在 i18n なし、独自ヘッダー（back+title）、フッターなし。最も変更が大きい。

- [ ] **Step 1: 現在のファイルの構造を確認する**

特にヘッダー構造、CSS変数、ブランド読込ロジック（`brand_id` パラメータ使用）の行番号を確認。

- [ ] **Step 2: `<html>` タグに `id="html-root"` を追加、`<head>` に共通読込**

```html
<html lang="ja" id="html-root">
```

Supabase CDNの後に:
```html
<link rel="stylesheet" href="./weir-common.css">
<script src="./weir-common.js"></script>
```

- [ ] **Step 3: 独自ヘッダーHTML → プレースホルダー、フッタープレースホルダー追加**

独自ヘッダー（back arrow + title + logo mark）を `<div id="weir-header"></div>` に置き換え。
ページ末尾（`</body>` の前）に `<div id="weir-footer"></div>` を追加。

- [ ] **Step 4: 重複CSS/JSを削除**

- 独自CSS変数 `--brand`, `--brand-dark`, `--brand-light` → 共通の `--brand-primary` 系に統一
- 独自ヘッダーCSS を削除
- `escH()` を削除
- ブランド読込IIFE内のCSS変数直接設定を削除

CSS変数名の変更に伴い、ページ内で `var(--brand)` を使っている箇所を `var(--brand-primary)` に一括置換。

- [ ] **Step 5: init() 呼び出し + i18n 対応**

```javascript
await AidenCommon.init({
  header: 'brand',
  footer: true,
  onBrandLoaded: function(brand) {
    document.title = brand.name + ' | 会員特典';
    // Membership page-specific brand data usage
  }
});
var escH = AidenCommon.escH;
```

既存の `brand_id` パラメータ解決は `AidenCommon.resolveBrandId()` に統合済み（`?brand_id=` をサポート）。

- [ ] **Step 6: 動作確認 + Commit**

```bash
git add weir-membership.html
git commit -m "refactor: integrate aiden-common into weir-membership.html — add header/footer/i18n"
```

---

## Task 9: weir-order.html に共通基盤を統合する

**Files:**
- Modify: `weir-order.html`

このページは現在 **Supabase未使用**、ハードコード店舗リスト。Phase 1ではSupabase初期化を追加し、共通ヘッダー/フッター/i18nを統合。ハードコード店舗リストのSupabase化はPhase 2。

- [ ] **Step 1: 現在のファイルの構造を確認する**

独自ヘッダー（`.app-header`）、`LNG` 辞書、`changeLang()`（getElementById方式）の行番号を確認。

- [ ] **Step 2: `<head>` にSupabase CDN + 共通読込を追加する**

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<link rel="stylesheet" href="./weir-common.css">
<script src="./weir-common.js"></script>
```

- [ ] **Step 3: 独自ヘッダー → プレースホルダー、フッタープレースホルダー追加**

`.app-header` を `<div id="weir-header"></div>` に置き換え。
ページ末尾に `<div id="weir-footer"></div>` を追加。

- [ ] **Step 4: LNG辞書を data-i18n 方式に移行**

`var LNG = {...}` を削除。
`changeLang()` の `getElementById` 方式を削除。
HTML内の翻訳対象要素に `data-i18n` 属性を付与。

```javascript
AidenCommon.addTranslations({
  // weir-order.html 固有の翻訳キー
  // LNG辞書の内容をここに移行
});
```

- [ ] **Step 5: 重複CSS/JSを削除、init() 呼び出し**

独自ヘッダーCSS、`escH()`（存在する場合）を削除。

```javascript
await AidenCommon.init({
  header: 'order',
  footer: true,
  onBack: function() {
    // 店舗選択ページの戻るボタン: ブランドHPへ
    var slug = AidenCommon.brand ? AidenCommon.brand.slug : '';
    window.location.href = './brand.html' + (slug ? '?brand=' + slug : '');
  },
  onBrandLoaded: function(brand) {
    document.title = brand.name + ' | モバイルオーダー';
  }
});
```

- [ ] **Step 6: 動作確認 + Commit**

```bash
git add weir-order.html
git commit -m "refactor: integrate aiden-common into weir-order.html — add Supabase, shared header/footer/i18n"
```

---

## Task 10: weir-order-store.html に共通基盤を統合する

**Files:**
- Modify: `weir-order-store.html`

- [ ] **Step 1: 現在のファイルの構造を確認する**
- [ ] **Step 2: `<head>` に共通CSS/JS読込を追加する**
- [ ] **Step 3: 独自ヘッダー → プレースホルダー、フッタープレースホルダー追加**
- [ ] **Step 4: 重複CSS/JSを削除**

独自ヘッダーCSS（`.header` 白背景版）、`escH()` を削除。
ブランドカラー適用ロジック（`STORE_DATA.brandColor` → CSS変数設定）を削除（AidenCommon.init が処理）。

- [ ] **Step 5: init() 呼び出し**

```javascript
await AidenCommon.init({
  header: 'order',
  footer: true,
  onBack: function() {
    window.location.href = './weir-order.html' + window.location.search;
  },
  onBrandLoaded: function(brand) {
    document.title = brand.name + ' | メニュー';
    // Show cart button
    var cartBtn = document.getElementById('weir-header-cart');
    if (cartBtn) cartBtn.style.display = '';
  }
});
var escH = AidenCommon.escH;
```

- [ ] **Step 6: カート/サインインの連携**

共通ヘッダーのカートバッジ更新: 既存のカート更新ロジック内で `document.getElementById('weir-cart-badge')` の textContent を更新するコードを追加。
サインインボタン: 既存の認証ロジックと `#weir-header-signin` を接続。

- [ ] **Step 7: 動作確認 + Commit**

```bash
git add weir-order-store.html
git commit -m "refactor: integrate aiden-common into weir-order-store.html"
```

---

## Task 11: weir-order-checkout.html に共通基盤を統合する

**Files:**
- Modify: `weir-order-checkout.html`

- [ ] **Step 1: 現在のファイルの構造を確認する**
- [ ] **Step 2: `<head>` にSupabase CDN移動 + 共通読込追加**

現在 Supabase CDN が mid-file (line 436) にある。`<head>` に移動:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<link rel="stylesheet" href="./weir-common.css">
<script src="./weir-common.js"></script>
```

- [ ] **Step 3: 独自ヘッダー → プレースホルダー、フッター追加、独自FOUC削除**

独自ヘッダーを `<div id="weir-header"></div>` に置き換え。
`<div id="weir-footer"></div>` を追加。
独自FOUC制御 (`body.style.opacity = '0.4'`) を削除 — weir-common.css の `body:not(.weir-ready)` が処理。

- [ ] **Step 4: 重複CSS/JSを削除**

独自ヘッダーCSS、`I18N` 辞書、`applyLang()`、`toggleLang()` を削除。
`data-i18n` 属性は既に付与されているのでそのまま活用。

- [ ] **Step 5: init() 呼び出し + ページ固有翻訳**

```javascript
AidenCommon.addTranslations({
  // checkout 固有の翻訳キー
  // 既存 I18N の en 辞書の内容 + 他言語追加
});

await AidenCommon.init({
  header: 'order',
  footer: true,
  onBack: function() {
    window.location.href = './weir-order-store.html' + window.location.search;
  },
  onBrandLoaded: function(brand) {
    document.title = brand.name + ' | お会計';
  }
});
var escH = AidenCommon.escH;
```

- [ ] **Step 6: 動作確認 + Commit**

```bash
git add weir-order-checkout.html
git commit -m "refactor: integrate aiden-common into weir-order-checkout.html"
```

---

## Task 12: 全ページリグレッション確認

**Files:**
- All 7 HTML pages + weir-common.css + weir-common.js

- [ ] **Step 1: npm run lint を実行**

Run: `npm run lint`
Expected: PASS (console.log 残存なし)

- [ ] **Step 2: 全ページの基本表示確認**

各ページをブラウザで開き、以下を確認:
1. `brand.html?brand=sumibite` — FOUC無し、ヘッダー/フッター表示、カルーセル動作
2. `weir-brand-menu.html?brand=sumibite` — FOUC無し、メニュー表示、カテゴリフィルタ動作
3. `weir-brand-stores.html?brand=sumibite` — FOUC無し、店舗検索動作
4. `weir-membership.html?brand_id=22222222-0000-0000-0000-000000000001` — FOUC無し、ヘッダー/フッター追加
5. `weir-order.html?brand=sumibite` — FOUC無し、MOヘッダー（ブランドカラー）
6. `weir-order-store.html` — FOUC無し、MOヘッダー、カート、フッター
7. `weir-order-checkout.html` — FOUC無し、MOヘッダー、フッター

- [ ] **Step 3: 言語切替テスト**

1. brand.html で英語に切替 → 全テキストが英語に
2. weir-brand-menu.html に遷移 → 英語が維持される
3. weir-brand-stores.html に遷移 → 英語が維持される
4. weir-order.html に遷移 → 英語が維持される

- [ ] **Step 4: モバイル表示確認**

ブラウザDevToolsでモバイルサイズ (375px) に:
1. ハンバーガーメニュー表示 → タップで展開
2. フッターが1カラム表示
3. MOヘッダーが正しく表示

- [ ] **Step 5: タイムアウトテスト**

ブラウザDevToolsのNetworkタブで Supabase への通信をブロック:
1. brand.html を開く
2. 3秒後にニュートラルカラー（白/グレー系）で表示されることを確認
3. 炭火亭の赤色が表示されないことを確認

- [ ] **Step 6: 問題があれば修正 + 最終Commit**

```bash
git add -A
git commit -m "fix: address Phase 1 regression issues"
```
