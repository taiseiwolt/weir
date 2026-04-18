/* =============================================================
   weir-common.js — Weir 共通基盤
   Brand loading, i18n, Header/Footer generation, init()
   Usage: <script src="weir-common.js"></script>
          <script>AidenCommon.init({ header:'brand', footer:true })</script>
   ============================================================= */
(function() {
  'use strict';

  /* =============================================================
     1. Constants
     ============================================================= */
  var SUPABASE_URL = 'https://iikwusprydaogzeslgdz.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC';
  var TIMEOUT_MS = 3000;

  var BRAND_COLUMNS = 'id,name,display_id,font_family,font_color,primary_color,primary_dark,primary_light,header_bg,header_text_color,logo_mark_type,logo_mark_emoji,logo_mark_src,logo_text_type,logo_text_value,sns_line,sns_x,sns_instagram,sns_facebook,sns_tiktok,sns_youtube,sns_threads,company_url,recruit_url,hero_catchphrase,brand_description,custom_domain,hp_settings';

  /* =============================================================
     2. escH() — XSS escape helper
     ============================================================= */
  function escH(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* =============================================================
     3. getSb() — lazy Supabase client init
     ============================================================= */
  var _sb = null;
  function getSb() {
    if (!_sb) {
      if (typeof supabase === 'undefined' || !supabase.createClient) {
        return null;
      }
      _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return _sb;
  }

  /* =============================================================
     4. resolveBrandId() — brand ID resolution
     ============================================================= */
  async function resolveBrandId() {
    // 1. Custom domain detection (highest priority)
    var hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== 'xorder.co.jp' && !hostname.endsWith('.vercel.app')) {
      var client = getSb();
      if (client) {
        try {
          var res = await client.from('brands_public').select('id').eq('custom_domain', hostname).limit(1);
          if (res.data && res.data.length > 0) return { type: 'id', value: res.data[0].id };
        } catch (e) { /* fall through */ }
      }
    }

    // 2. URL parameters
    var params = new URLSearchParams(window.location.search);
    var brandIdParam = params.get('brand_id');
    if (brandIdParam) return { type: 'id', value: brandIdParam };

    var brandSlug = params.get('brand');

    // 2b. Pathname fallback: Vercel rewrite (vercel.json:25) strips destination
    //     query, so `/izakaya-ushio` arrives as pathname='/izakaya-ushio',
    //     search=''. Derive the slug from the first path segment.
    //     Phase 2-a forward-compat: '/izakaya-ushio/ra6DXDh' →
    //     firstSegment='izakaya-ushio' is still correct.
    //     NOTE: brand slugs are assumed ASCII (hyphenated english). Multibyte
    //     slugs would need decodeURIComponent — out of Phase 1 scope.
    if (!brandSlug) {
      var pathname = window.location.pathname;
      if (pathname && pathname !== '/') {
        var firstSegment = pathname.slice(1).split('/')[0];
        // Skip static files (favicon.ico, robots.txt, sitemap.xml, *.html, etc.)
        var hasExtension = firstSegment.indexOf('.') !== -1;
        // Mirror vercel.json:25 negative lookahead for reserved prefixes
        var EXCLUDED_PREFIXES = ['api', 'legal', 'weir-', 'brand', '404', 'index', 'test-', 'e2e-', 'playwright', 'seed-', 'qa-', 'docs', 'public'];
        var isExcluded = EXCLUDED_PREFIXES.some(function(p) {
          return firstSegment === p || firstSegment.startsWith(p);
        });
        if (!hasExtension && !isExcluded && firstSegment) {
          brandSlug = firstSegment;
        }
      }
    }

    if (brandSlug) {
      var client = getSb();
      if (client) {
        try {
          var res = await client.from('brands_public').select('id').eq('slug', brandSlug).limit(1);
          if (res.data && res.data.length > 0) return { type: 'id', value: res.data[0].id };
        } catch (e) { /* fall through to default */ }
      }
      // Slug didn't resolve — fall through to sessionStorage / default
    }

    // 3. sessionStorage
    var stored = sessionStorage.getItem('weir_brand_id');
    if (stored) return { type: 'id', value: stored };

    // D-83: no hardcoded default. Caller must handle null.
    return { type: 'none', value: null };
  }

  /* =============================================================
     5. loadBrand(brandId) — query brands table
     ============================================================= */
  function loadBrand(resolved) {
    var client = getSb();
    if (!client) return Promise.reject(new Error('Supabase not loaded'));

    if (!resolved || !resolved.value) return Promise.resolve(null);

    var query = client.from('brands_public').select(BRAND_COLUMNS).eq('id', resolved.value);

    return query.single().then(function(res) {
      if (res.error) throw res.error;
      var brand = res.data;
      if (brand && brand.id) {
        sessionStorage.setItem('weir_brand_id', brand.id);
      }
      return brand;
    });
  }

  /* =============================================================
     6. applyBrandCSS(brand) — set CSS custom properties + Google Fonts
     ============================================================= */
  function applyBrandCSS(brand) {
    if (!brand) return;
    var root = document.documentElement;
    if (brand.primary_color)    root.style.setProperty('--brand-primary', brand.primary_color);
    if (brand.primary_dark)     root.style.setProperty('--brand-primary-dark', brand.primary_dark);
    if (brand.primary_light)    root.style.setProperty('--brand-primary-light', brand.primary_light);
    if (brand.header_bg)        root.style.setProperty('--brand-header-bg', brand.header_bg);
    if (brand.header_text_color) root.style.setProperty('--brand-header-text', brand.header_text_color);
    if (brand.font_color)       root.style.setProperty('--brand-font-color', brand.font_color);
    if (brand.font_family) {
      root.style.setProperty('--brand-font', "'" + brand.font_family + "', sans-serif");
      // Update Google Fonts link
      var fontLink = document.getElementById('font-link');
      if (fontLink) {
        fontLink.href = 'https://fonts.googleapis.com/css2?family=' +
          encodeURIComponent(brand.font_family) + ':wght@300;400;500;700&display=swap';
      }
    }
  }

  /* =============================================================
     7. I18N Dictionary — 7 languages
     ============================================================= */
  var I18N = {
    ja: {
      nav_menu:'メニュー', nav_stores:'お店を探す', nav_membership:'会員特典',
      nav_reserve:'📅 来店予約', nav_order:'🥡 テイクアウト・デリバリー', nav_order_short:'🥡 テイクアウト',
      footer_desc:'', footer_menu:'メニュー', footer_service:'サービス',
      footer_company:'企業情報', footer_news:'ニュース・キャンペーン', footer_recruit:'採用情報',
      f_grand_menu:'グランドメニュー', f_yakiniku:'焼肉・特選肉', f_rice:'ご飯・麺',
      f_drink:'ドリンク', f_course:'コース・プラン',
      cta_reserve:'来店予約', cta_takeout:'テイクアウト', cta_delivery:'デリバリー',
      f_faq:'よくあるご質問', f_contact:'お問い合わせ', f_recruit:'採用情報',
      f_privacy:'プライバシーポリシー', f_terms:'利用規約', f_sitemap:'サイトマップ',
      news_more_link:'ニュース一覧', lang_label:'言語/Language',
      signin:'サインイン', cart:'カート', back:'戻る'
    },
    en: {
      nav_menu:'Menu', nav_stores:'Find a Store', nav_membership:'Member Benefits',
      nav_reserve:'📅 Reservation', nav_order:'🥡 Takeout / Delivery', nav_order_short:'🥡 Takeout',
      footer_desc:'', footer_menu:'Menu', footer_service:'Services',
      footer_company:'Company', footer_news:'News & Campaigns', footer_recruit:'Careers',
      f_grand_menu:'Grand Menu', f_yakiniku:'Yakiniku & Select Cuts', f_rice:'Rice & Noodles',
      f_drink:'Drinks', f_course:'Course Plans',
      cta_reserve:'Reservation', cta_takeout:'Takeout', cta_delivery:'Delivery',
      f_faq:'FAQ', f_contact:'Contact Us', f_recruit:'Careers',
      f_privacy:'Privacy Policy', f_terms:'Terms of Use', f_sitemap:'Sitemap',
      news_more_link:'See All News', lang_label:'言語/Language',
      signin:'Sign In', cart:'Cart', back:'Back'
    },
    zh: {
      nav_menu:'菜单', nav_stores:'查找门店', nav_membership:'会员特典',
      nav_reserve:'📅 预约', nav_order:'🥡 外带·外送', nav_order_short:'🥡 外带',
      footer_desc:'', footer_menu:'菜单', footer_service:'服务',
      footer_company:'公司信息', footer_news:'新闻・活动', footer_recruit:'招聘信息',
      f_grand_menu:'完整菜单', f_yakiniku:'烤肉·精选肉', f_rice:'米饭·面食',
      f_drink:'饮品', f_course:'套餐',
      cta_reserve:'预约', cta_takeout:'外带', cta_delivery:'外送',
      f_faq:'常见问题', f_contact:'联系我们', f_recruit:'招聘信息',
      f_privacy:'隐私政策', f_terms:'使用条款', f_sitemap:'网站地图',
      news_more_link:'查看全部新闻', lang_label:'言語/Language',
      signin:'登录', cart:'购物车', back:'返回'
    },
    ko: {
      nav_menu:'메뉴', nav_stores:'매장 찾기', nav_membership:'회원 혜택',
      nav_reserve:'📅 예약', nav_order:'🥡 포장·배달', nav_order_short:'🥡 포장',
      footer_desc:'', footer_menu:'메뉴', footer_service:'서비스',
      footer_company:'기업 정보', footer_news:'뉴스・캠페인', footer_recruit:'채용 정보',
      f_grand_menu:'전체 메뉴', f_yakiniku:'야키니쿠·특선육', f_rice:'밥·면',
      f_drink:'음료', f_course:'코스 플랜',
      cta_reserve:'예약', cta_takeout:'포장', cta_delivery:'배달',
      f_faq:'자주 묻는 질문', f_contact:'문의하기', f_recruit:'채용 정보',
      f_privacy:'개인정보 처리방침', f_terms:'이용약관', f_sitemap:'사이트맵',
      news_more_link:'뉴스 전체 보기', lang_label:'言語/Language',
      signin:'로그인', cart:'장바구니', back:'뒤로'
    },
    fr: {
      nav_menu:'Menu', nav_stores:'Trouver un restaurant', nav_membership:'Avantages membres',
      nav_reserve:'📅 Réservation', nav_order:'🥡 À emporter / Livraison', nav_order_short:'🥡 À emporter',
      footer_desc:'', footer_menu:'Menu', footer_service:'Services',
      footer_company:'Entreprise', footer_news:'Actualités & Campagnes', footer_recruit:'Recrutement',
      f_grand_menu:'Grand Menu', f_yakiniku:'Yakiniku & Viandes', f_rice:'Riz & Nouilles',
      f_drink:'Boissons', f_course:'Menus & Formules',
      cta_reserve:'Réservation', cta_takeout:'À emporter', cta_delivery:'Livraison',
      f_faq:'FAQ', f_contact:'Contact', f_recruit:'Recrutement',
      f_privacy:'Politique de confidentialité', f_terms:"Conditions d'utilisation", f_sitemap:'Plan du site',
      news_more_link:'Voir toutes les actualités', lang_label:'言語/Language',
      signin:'Connexion', cart:'Panier', back:'Retour'
    },
    it: {
      nav_menu:'Menu', nav_stores:'Trova un ristorante', nav_membership:'Vantaggi membri',
      nav_reserve:'📅 Prenotazione', nav_order:'🥡 Asporto / Consegna', nav_order_short:'🥡 Asporto',
      footer_desc:'', footer_menu:'Menu', footer_service:'Servizi',
      footer_company:'Azienda', footer_news:'Notizie & Campagne', footer_recruit:'Lavora con noi',
      f_grand_menu:'Menu Completo', f_yakiniku:'Yakiniku & Carni', f_rice:'Riso & Noodle',
      f_drink:'Bevande', f_course:'Menu & Formule',
      cta_reserve:'Prenotazione', cta_takeout:'Asporto', cta_delivery:'Consegna',
      f_faq:'FAQ', f_contact:'Contatti', f_recruit:'Lavora con noi',
      f_privacy:'Privacy Policy', f_terms:'Termini di utilizzo', f_sitemap:'Mappa del sito',
      news_more_link:'Tutte le notizie', lang_label:'言語/Language',
      signin:'Accedi', cart:'Carrello', back:'Indietro'
    },
    id: {
      nav_menu:'Menu', nav_stores:'Cari Restoran', nav_membership:'Keuntungan Member',
      nav_reserve:'📅 Reservasi', nav_order:'🥡 Bawa Pulang / Pesan Antar', nav_order_short:'🥡 Bawa Pulang',
      footer_desc:'', footer_menu:'Menu', footer_service:'Layanan',
      footer_company:'Perusahaan', footer_news:'Berita & Kampanye', footer_recruit:'Karir',
      f_grand_menu:'Menu Lengkap', f_yakiniku:'Yakiniku & Pilihan Daging', f_rice:'Nasi & Mie',
      f_drink:'Minuman', f_course:'Paket Kursus',
      cta_reserve:'Reservasi', cta_takeout:'Bawa Pulang', cta_delivery:'Pesan Antar',
      f_faq:'FAQ', f_contact:'Hubungi Kami', f_recruit:'Karir',
      f_privacy:'Kebijakan Privasi', f_terms:'Syarat Penggunaan', f_sitemap:'Peta Situs',
      news_more_link:'Lihat Semua Berita', lang_label:'言語/Language',
      signin:'Masuk', cart:'Keranjang', back:'Kembali'
    }
  };

  /* =============================================================
     8. addTranslations(dict) — merge page-specific translations
     ============================================================= */
  function addTranslations(dict) {
    if (!dict) return;
    Object.keys(dict).forEach(function(lang) {
      if (!I18N[lang]) I18N[lang] = {};
      var entries = dict[lang];
      Object.keys(entries).forEach(function(key) {
        I18N[lang][key] = entries[key];
      });
    });
  }

  /* =============================================================
     9. t(key) — get translation for current language
     ============================================================= */
  function t(key) {
    var lang = AidenCommon.lang || 'ja';
    if (I18N[lang] && I18N[lang][key] !== undefined) return I18N[lang][key];
    if (I18N.ja && I18N.ja[key] !== undefined) return I18N.ja[key];
    return key;
  }

  /* =============================================================
     10. changeLang(lang) — switch language
     ============================================================= */
  function changeLang(lang) {
    if (!I18N[lang]) return;
    AidenCommon.lang = lang;
    sessionStorage.setItem('weir_lang', lang);

    var dict = I18N[lang];
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        if (el.tagName === 'INPUT') el.placeholder = dict[key];
        else el.innerHTML = dict[key].replace(/\n/g, '<br>');
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) el.placeholder = dict[key];
    });

    // Update html lang attribute
    document.documentElement.lang = lang;

    // Sync all lang-select dropdowns
    document.querySelectorAll('.lang-select').forEach(function(sel) {
      sel.value = lang;
    });
  }

  /* =============================================================
     11. buildBrandPath(brand, sub) — build brand-scoped path
          Returns "/{brand.slug}{sub}" or just sub if no slug.
     ============================================================= */
  function buildBrandPath(brand, sub) {
    sub = sub || '';
    if (brand && brand.slug) {
      return '/' + brand.slug + sub;
    }
    return sub;
  }

  /* =============================================================
     12. detectActivePage() — detect which page is active
     ============================================================= */
  function detectActivePage() {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('brand-menu') !== -1) return 'menu';
    if (path.indexOf('brand-stores') !== -1) return 'stores';
    if (path.indexOf('membership') !== -1) return 'membership';
    if (path.indexOf('brand-news') !== -1) return 'news';
    return '';
  }

  /* =============================================================
     13. buildLangSelect() — language selector HTML
     ============================================================= */
  function buildLangSelect() {
    var currentLang = AidenCommon.lang || 'ja';
    return '<div class="lang-select-wrap">' +
      '<select class="lang-select" onchange="AidenCommon.changeLang(this.value)">' +
        '<option value="ja"' + (currentLang === 'ja' ? ' selected' : '') + '>言語/Language</option>' +
        '<option value="ja"' + (currentLang === 'ja' ? ' selected' : '') + '>日本語</option>' +
        '<option value="en"' + (currentLang === 'en' ? ' selected' : '') + '>English</option>' +
        '<option value="zh"' + (currentLang === 'zh' ? ' selected' : '') + '>中文</option>' +
        '<option value="ko"' + (currentLang === 'ko' ? ' selected' : '') + '>한국어</option>' +
        '<option value="fr"' + (currentLang === 'fr' ? ' selected' : '') + '>français</option>' +
        '<option value="it"' + (currentLang === 'it' ? ' selected' : '') + '>Italiano</option>' +
        '<option value="id"' + (currentLang === 'id' ? ' selected' : '') + '>Bahasa Indonesia</option>' +
      '</select>' +
      '<span class="lang-select-arrow">▼</span>' +
    '</div>';
  }

  /* =============================================================
     14. renderLogoMark(brand) — logo mark HTML
     ============================================================= */
  function renderLogoMark(brand) {
    if (brand.logo_mark_type === 'image' && brand.logo_mark_src) {
      return '<span class="header-logo-mark"><img src="' + escH(brand.logo_mark_src) + '" alt="logo"></span>';
    }
    return '<span class="header-logo-mark">' + escH(brand.logo_mark_emoji || '') + '</span>';
  }

  /* =============================================================
     15. renderLogoText(brand) — logo text HTML
     ============================================================= */
  function renderLogoText(brand) {
    if (brand.logo_text_type === 'image' && brand.logo_text_value) {
      return '<span class="header-logo-text"><img src="' + escH(brand.logo_text_value) + '" alt="' + escH(brand.name) + '"></span>';
    }
    return '<span class="header-logo-text">' + escH(brand.logo_text_value || brand.name || '') + '</span>';
  }

  /* =============================================================
     16. renderHeaderBrand(brand) — Type A header
     ============================================================= */
  function renderHeaderBrand(brand) {
    var el = document.getElementById('weir-header');
    if (!el) return;
    if (!brand) return;

    var active = detectActivePage();
    var brandName = escH(brand.name || '');

    // Build nav links with active state
    var menuClass = 'header-nav-link' + (active === 'menu' ? ' active' : '');
    var storesClass = 'header-nav-link' + (active === 'stores' ? ' active' : '');
    var membershipClass = 'header-nav-link' + (active === 'membership' ? ' active' : '');

    var html = '<header class="header">' +
      '<div class="header-main">' +
        '<div class="header-logo">' +
          '<a href="' + buildBrandPath(brand) + '">' +
            '<span style="display:flex;align-items:center;gap:10px">' +
              renderLogoMark(brand) +
              renderLogoText(brand) +
            '</span>' +
          '</a>' +
        '</div>' +
        '<nav class="header-nav">' +
          '<a href="' + buildBrandPath(brand, '/menu') + '" class="' + menuClass + '" data-i18n="nav_menu">' + t('nav_menu') + '</a>' +
          '<a href="' + buildBrandPath(brand, '/stores') + '" class="' + storesClass + '" data-i18n="nav_stores">' + t('nav_stores') + '</a>' +
          '<a href="' + buildBrandPath(brand, '/membership') + '" class="' + membershipClass + '" data-i18n="nav_membership" id="nav-membership-link">' + t('nav_membership') + '</a>' +
          '<a href="javascript:void(0)" class="header-nav-link cta" data-i18n="nav_reserve" onclick="if(window.openResModal)openResModal()">' + t('nav_reserve') + '</a>' +
          '<a href="' + buildBrandPath(brand, '/order') + '" class="header-nav-link cta" data-i18n="nav_order">' + t('nav_order') + '</a>' +
        '</nav>' +
        buildLangSelect() +
        '<button class="header-hamburger" id="hamburger" onclick="AidenCommon.toggleNav()">☰</button>' +
      '</div>' +
    '</header>' +
    '<div class="mobile-nav" id="mobile-nav">' +
      '<div class="mobile-nav-cta">' +
        '<a href="javascript:void(0)" data-i18n="nav_reserve" onclick="if(window.openResModal)openResModal()">' + t('nav_reserve') + '</a>' +
        '<a href="' + buildBrandPath(brand, '/order') + '" data-i18n="nav_order_short">' + t('nav_order_short') + '</a>' +
        '<a href="' + buildBrandPath(brand, '/order') + '?mode=delivery">' + t('cta_delivery') + '</a>' +
      '</div>' +
      '<a href="' + buildBrandPath(brand, '/menu') + '" data-i18n="nav_menu">' + t('nav_menu') + '</a>' +
      '<a href="' + buildBrandPath(brand, '/stores') + '" data-i18n="nav_stores">📍 ' + t('nav_stores') + '</a>' +
      '<a href="' + buildBrandPath(brand, '/membership') + '" data-i18n="nav_membership">🏆 ' + t('nav_membership') + '</a>' +
    '</div>';

    el.innerHTML = html;
  }

  /* =============================================================
     17. renderHeaderOrder(brand, options) — Type B header
     ============================================================= */
  function renderHeaderOrder(brand, options) {
    var el = document.getElementById('weir-header');
    if (!el) return;

    options = options || {};

    var html = '<header class="header header--order">' +
      '<div class="header-main">' +
        '<button class="header-back" id="weir-header-back" data-i18n="back" aria-label="' + t('back') + '">←</button>' +
        '<div class="header-center">' +
          '<div class="header-logo">' +
            '<span style="display:flex;align-items:center;gap:10px">' +
              renderLogoMark(brand) +
              renderLogoText(brand) +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="header-actions">' +
          buildLangSelect() +
          '<button class="header-cart" id="weir-header-cart" style="display:none" aria-label="' + t('cart') + '">' +
            '🛒<span class="header-cart-badge" id="weir-cart-badge" style="display:none">0</span>' +
          '</button>' +
          '<button class="header-signin" id="weir-header-signin" data-i18n="signin">' + t('signin') + '</button>' +
        '</div>' +
      '</div>' +
    '</header>';

    el.innerHTML = html;

    // Add body class for padding-top
    document.body.classList.add('weir-order-body');

    // Attach back button handler
    var backBtn = document.getElementById('weir-header-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        if (typeof options.onBack === 'function') {
          options.onBack();
        } else {
          window.history.back();
        }
      });
    }
  }

  /* =============================================================
     17a. showNotFound() — Phase 1 暫定 404 表示
          (Phase 2-a で正式な 404.html に置き換え予定)
     ============================================================= */
  function showNotFound() {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,\'Hiragino Sans\',\'Noto Sans JP\',sans-serif;background:#f5f5f5;padding:20px;text-align:center">' +
        '<h1 style="font-size:28px;color:#333;margin-bottom:16px;font-weight:600">お店が見つかりません</h1>' +
        '<p style="color:#666;font-size:14px;line-height:1.7;max-width:400px">URL を再度ご確認ください。</p>' +
      '</div>';
  }

  /* =============================================================
     17b. RESERVATION_MODAL_CSS — 来店予約モーダル CSS
     ============================================================= */
  var RESERVATION_MODAL_CSS = ''
    + '.res-modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;align-items:center;justify-content:center}'
    + '.res-modal-bg.open{display:flex}'
    + '.res-modal{background:white;border-radius:12px;width:92%;max-width:560px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}'
    + '.res-modal-header{padding:18px 22px;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;border-radius:12px 12px 0 0;z-index:1}'
    + '.res-modal-title{font-size:16px;font-weight:700}'
    + '.res-modal-close{background:none;border:none;font-size:22px;color:#999;line-height:1;padding:4px;cursor:pointer}'
    + '.res-modal-body{padding:22px}'
    + '.rm-steps{display:flex;margin-bottom:24px}'
    + '.rm-step{flex:1;text-align:center;position:relative}'
    + '.rm-step::after{content:"";position:absolute;top:13px;left:50%;right:-50%;height:1px;background:#e8e8e8}'
    + '.rm-step:last-child::after{display:none}'
    + '.rm-step-dot{width:26px;height:26px;border-radius:50%;background:#f5f5f5;border:1px solid #ddd;color:#999;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;position:relative;z-index:1;transition:all .2s}'
    + '.rm-step.active .rm-step-dot{background:#1a1a1a;border-color:#1a1a1a;color:white}'
    + '.rm-step.done .rm-step-dot{background:#27ae60;border-color:#27ae60;color:white}'
    + '.rm-step-label{font-size:10px;color:#999}'
    + '.rm-step.active .rm-step-label{color:#1a1a1a;font-weight:600}'
    + '.rf-field{margin-bottom:16px}'
    + '.rf-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '.rf-label{font-size:11px;font-weight:700;color:#666;margin-bottom:5px;display:flex;align-items:center;gap:4px}'
    + '.rf-req{color:var(--brand-primary)}'
    + '.rf-input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-family:var(--brand-font);font-size:14px;color:#1a1a1a;outline:none;transition:border-color .15s;background:white}'
    + '.rf-input:focus{border-color:#888}'
    + '.rf-input.error{border-color:var(--brand-primary);background:#FFF8F8}'
    + '.rf-error{font-size:11px;color:var(--brand-primary);margin-top:4px;display:none}'
    + '.rf-error.show{display:block}'
    + '.rm-slot-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}'
    + '.rm-slot-title{font-size:12px;font-weight:700;color:#666}'
    + '.rm-slot-note{font-size:11px;color:#999}'
    + '.rm-slot-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:16px}'
    + '.rm-slot-b{padding:9px 4px;text-align:center;border:1px solid #e0e0e0;border-radius:5px;font-size:12px;cursor:pointer;transition:all .12s;background:white;width:100%;font-family:var(--brand-font)}'
    + '.rm-slot-b:hover{border-color:#333}'
    + '.rm-slot-b.on{background:#1a1a1a;color:white;border-color:#1a1a1a}'
    + '.rm-slot-b.slot-full{background:#f5f5f5;color:#bbb;cursor:default}'
    + '.rm-slot-b.slot-full:hover{border-color:var(--brand-primary);background:#fff5f5}'
    + '.rm-cap-alert{padding:10px 14px;border-radius:5px;margin-bottom:14px;font-size:13px;display:none}'
    + '.rm-cap-alert.ok{background:#f0faf5;border:1px solid rgba(39,174,96,.3);color:#27ae60;display:block}'
    + '.rm-cap-alert.err{background:#fff5f5;border:1px solid rgba(211,47,47,.25);color:var(--brand-primary);display:block}'
    + '.rm-btn{width:100%;padding:13px;border:none;border-radius:6px;font-size:14px;font-weight:700;background:var(--brand-primary);color:white;cursor:pointer;font-family:var(--brand-font);transition:opacity .15s}'
    + '.rm-btn:hover{opacity:.88}'
    + '.rm-btn:disabled{opacity:.35;cursor:not-allowed}'
    + '.rm-btn-back{width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;font-size:14px;background:none;color:#666;cursor:pointer;font-family:var(--brand-font)}'
    + '.rm-confirm-box{background:#f8f8f8;border-radius:8px;padding:16px;margin-bottom:16px}'
    + '.rm-confirm-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:13px}'
    + '.rm-confirm-row:last-child{border-bottom:none}'
    + '.rm-confirm-label{color:#666}'
    + '.rm-complete-box{text-align:center;padding:28px 10px}'
    + '.rm-store-preset{padding:10px 12px;border:1px solid #ddd;border-radius:6px;background:#f8f8f8;font-size:14px;color:#333;font-weight:600}'
    + '@media(max-width:480px){.rf-row{grid-template-columns:1fr}.rm-slot-grid{grid-template-columns:repeat(3,1fr)}}';

  function injectReservationModalCSS() {
    if (document.getElementById('weir-res-modal-css')) return;
    var s = document.createElement('style');
    s.id = 'weir-res-modal-css';
    s.textContent = RESERVATION_MODAL_CSS;
    document.head.appendChild(s);
  }

  /* =============================================================
     17c. injectReservationModalDOM — モーダル本体を body に append
     ============================================================= */
  var RESERVATION_MODAL_HTML = ''
    + '<div class="res-modal-bg" id="res-modal-bg">'
    +   '<div class="res-modal">'
    +     '<div class="res-modal-header">'
    +       '<div class="res-modal-title">ご予約</div>'
    +       '<button class="res-modal-close" onclick="closeResModal()">×</button>'
    +     '</div>'
    +     '<div class="res-modal-body">'
    +       '<div class="rm-steps">'
    +         '<div class="rm-step active" id="rms1"><div class="rm-step-dot">1</div><div class="rm-step-label">日時・人数</div></div>'
    +         '<div class="rm-step" id="rms2"><div class="rm-step-dot">2</div><div class="rm-step-label">お客様情報</div></div>'
    +         '<div class="rm-step" id="rms3"><div class="rm-step-dot">3</div><div class="rm-step-label">確認</div></div>'
    +       '</div>'
    +       '<div id="rmstep-1">'
    +         '<div class="rf-field" id="rm-store-field">'
    +           '<div class="rf-label">予約店舗 <span class="rf-req">*</span></div>'
    +           '<select id="rm-store" class="rf-input" onchange="rmOnStoreChange()">'
    +             '<option value="">店舗を選択してください</option>'
    +           '</select>'
    +           '<div class="rf-error" id="err-rm-store">店舗を選択してください</div>'
    +         '</div>'
    +         '<div class="rf-field" id="rm-store-preset-field" style="display:none">'
    +           '<div class="rf-label">予約店舗</div>'
    +           '<div class="rm-store-preset" id="rm-store-preset-text"></div>'
    +         '</div>'
    +         '<div class="rf-row" style="margin-bottom:16px">'
    +           '<div class="rf-field" style="margin-bottom:0">'
    +             '<div class="rf-label">日付 <span class="rf-req">*</span></div>'
    +             '<input type="date" id="rm-date" class="rf-input">'
    +           '</div>'
    +           '<div class="rf-field" style="margin-bottom:0">'
    +             '<div class="rf-label">人数 <span class="rf-req">*</span></div>'
    +             '<select id="rm-guests" class="rf-input" onchange="rmCheckCap()">'
    +               '<option value="1">1名</option><option value="2">2名</option>'
    +               '<option value="3" selected>3名</option><option value="4">4名</option>'
    +               '<option value="5">5名</option><option value="6">6名</option><option value="8">8名</option>'
    +             '</select>'
    +           '</div>'
    +         '</div>'
    +         '<div class="rm-slot-header">'
    +           '<div class="rm-slot-title">時間を選択</div>'
    +           '<div class="rm-slot-note">🔔 から空席通知が可能</div>'
    +         '</div>'
    +         '<div class="rm-slot-grid">'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:00\')">17:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:15\')">17:15</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:30\')">17:30</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'17:45\')">17:45</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:00\')">18:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:15\')">18:15</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:30\')">18:30</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'18:45\')">18:45</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'19:00\')">19:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'19:30\')">19:30</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'20:00\')">20:00</button>'
    +           '<button class="rm-slot-b" onclick="rmSelSlot(this,\'20:30\')">20:30</button>'
    +         '</div>'
    +         '<div class="rm-cap-alert" id="rm-cap-alert"></div>'
    +         '<button id="rm-step1-btn" class="rm-btn" onclick="rmGoStep(2)" disabled style="opacity:.35">次へ：お客様情報を入力</button>'
    +       '</div>'
    +       '<div id="rmstep-2" style="display:none">'
    +         '<div class="rf-row">'
    +           '<div class="rf-field">'
    +             '<div class="rf-label">お名前 <span class="rf-req">*</span></div>'
    +             '<input id="rm-name" type="text" placeholder="山田 花子" class="rf-input" oninput="rmClearErr(\'rm-name\')">'
    +             '<div class="rf-error" id="err-rm-name"></div>'
    +           '</div>'
    +           '<div class="rf-field">'
    +             '<div class="rf-label">電話番号 <span class="rf-req">*</span></div>'
    +             '<input id="rm-phone" type="tel" placeholder="09012345678" class="rf-input" oninput="rmClearErr(\'rm-phone\')">'
    +             '<div class="rf-error" id="err-rm-phone"></div>'
    +           '</div>'
    +         '</div>'
    +         '<div class="rf-field">'
    +           '<div class="rf-label">メールアドレス <span class="rf-req">*</span></div>'
    +           '<input id="rm-email" type="email" placeholder="example@email.com" class="rf-input" oninput="rmClearErr(\'rm-email\')">'
    +           '<div class="rf-error" id="err-rm-email"></div>'
    +         '</div>'
    +         '<div class="rf-field">'
    +           '<div class="rf-label">ご要望・アレルギー</div>'
    +           '<textarea id="rm-notes" rows="3" placeholder="アレルギー情報、記念日の演出ご希望などご自由にお書きください。" class="rf-input" style="resize:vertical"></textarea>'
    +         '</div>'
    +         '<div style="display:flex;gap:10px">'
    +           '<button class="rm-btn-back" onclick="rmGoStep(1)" style="flex:1">← 戻る</button>'
    +           '<button class="rm-btn" onclick="rmValidateStep2()" style="flex:2">確認へ進む</button>'
    +         '</div>'
    +       '</div>'
    +       '<div id="rmstep-3" style="display:none">'
    +         '<div class="rm-confirm-box" id="rm-confirm-box"></div>'
    +         '<div style="font-size:12px;color:#666;margin-bottom:14px;line-height:1.9">上記内容でご予約を確定します。確定後、ご登録のメールアドレス宛に確認メールをお送りします。</div>'
    +         '<div style="display:flex;gap:10px">'
    +           '<button class="rm-btn-back" onclick="rmGoStep(2)" style="flex:1">← 戻る</button>'
    +           '<button class="rm-btn" onclick="rmSubmit()" style="flex:2">予約を確定する</button>'
    +         '</div>'
    +       '</div>'
    +       '<div id="rmstep-complete" style="display:none">'
    +         '<div class="rm-complete-box">'
    +           '<div style="font-size:52px;margin-bottom:14px">✅</div>'
    +           '<div id="rm-res-id" style="font-size:22px;font-weight:700;margin-bottom:10px;color:var(--brand-primary)">RES-000000</div>'
    +           '<div style="font-size:13px;color:#666;line-height:1.9">ご予約ありがとうございます。<br>確認メールをお送りしました。</div>'
    +           '<button class="rm-btn" onclick="closeResModal()" style="margin-top:22px;max-width:200px">閉じる</button>'
    +         '</div>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>';

  function injectReservationModalDOM() {
    if (document.getElementById('res-modal-bg')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = RESERVATION_MODAL_HTML;
    document.body.appendChild(wrap.firstChild);
    document.getElementById('res-modal-bg').addEventListener('click', function(e){
      if (e.target === this) closeResModal();
    });
  }

  /* =============================================================
     17d. 来店予約モーダル — JS 関数群
          source of truth: weir-brand-stores.html の rmSubmit (real impl)
     ============================================================= */
  var rmSelTime = null;
  var rmPresetStore = null;
  var rmStoresLoaded = false;

  async function loadReservationStoresIfNeeded() {
    if (rmStoresLoaded) return;
    var brand = window.AidenCommon && window.AidenCommon.brand;
    if (!brand || !brand.id) return;
    var client = getSb();
    if (!client) return;
    try {
      var res = await client.from('venues_public').select('id, name').eq('brand_id', brand.id).order('name');
      var sel = document.getElementById('rm-store');
      if (!sel || !res.data) return;
      sel.innerHTML = '<option value="">店舗を選択してください</option>';
      res.data.forEach(function(v) {
        sel.innerHTML += '<option value="' + escH(v.id) + '">' + escH(v.name) + '</option>';
      });
      rmStoresLoaded = true;
    } catch (e) { /* 失敗時は dropdown 空のまま */ }
  }

  function openResModal(storeValue) {
    if (!document.getElementById('res-modal-bg')) {
      injectReservationModalCSS();
      injectReservationModalDOM();
    }
    rmSelTime = null;
    rmPresetStore = storeValue || null;
    var dropdown = document.getElementById('rm-store-field');
    var preset   = document.getElementById('rm-store-preset-field');
    if (rmPresetStore) {
      dropdown.style.display = 'none';
      preset.style.display   = 'block';
      document.getElementById('rm-store-preset-text').textContent = rmPresetStore;
    } else {
      dropdown.style.display = 'block';
      preset.style.display   = 'none';
      document.getElementById('rm-store').selectedIndex = 0;
    }
    document.getElementById('rm-date').value = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.rm-slot-b').forEach(function(b){ b.classList.remove('on'); });
    document.getElementById('rm-cap-alert').className = 'rm-cap-alert';
    document.getElementById('rm-step1-btn').disabled = true;
    document.getElementById('rm-step1-btn').style.opacity = '.35';
    rmGoStep(1);
    document.getElementById('res-modal-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!rmPresetStore) loadReservationStoresIfNeeded();
  }

  function closeResModal() {
    var bg = document.getElementById('res-modal-bg');
    if (bg) bg.classList.remove('open');
    document.body.style.overflow = '';
  }

  function rmOnStoreChange() { rmCheckCap(); }

  function rmSelSlot(el, t) {
    if (!rmPresetStore && !document.getElementById('rm-store').value) {
      document.getElementById('err-rm-store').classList.add('show');
      document.getElementById('rm-store').focus();
      return;
    }
    rmSelTime = t;
    document.querySelectorAll('.rm-slot-b:not(.slot-full)').forEach(function(b){ b.classList.remove('on'); });
    el.classList.add('on');
    var btn = document.getElementById('rm-step1-btn');
    btn.disabled = false; btn.style.opacity = '1';
    rmCheckCap();
  }

  function rmCheckCap() {
    if (!rmSelTime) return;
    var g  = parseInt(document.getElementById('rm-guests').value);
    var ok = [{s:2,n:4},{s:4,n:3},{s:6,n:2},{s:8,n:1}].some(function(t){ return t.s>=g&&t.n>0; });
    var el = document.getElementById('rm-cap-alert');
    el.className = 'rm-cap-alert ' + (ok ? 'ok' : 'err');
    el.textContent = ok ? '✅ ' + g + '名様のご予約が可能です' : '⚠️ 満席です。時間帯を変更してください。';
    document.getElementById('rm-step1-btn').disabled = !ok;
    document.getElementById('rm-step1-btn').style.opacity = ok ? '1' : '.4';
  }

  function rmOpenVacancy(time) {
    alert('🔔 ' + time + ' の空席通知は近日対応予定です');
  }

  function rmGoStep(n) {
    [1,2,3,'complete'].forEach(function(s){
      var el = document.getElementById('rmstep-' + s);
      if (el) el.style.display = (s === n) ? 'block' : 'none';
    });
    ['rms1','rms2','rms3'].forEach(function(id, i){
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active','done');
      if (i+1 < n) el.classList.add('done');
      else if (i+1 === n) el.classList.add('active');
    });
    if (n === 3) {
      var storeEl = document.getElementById('rm-store');
      var storeName = rmPresetStore
        ? rmPresetStore
        : (storeEl.options[storeEl.selectedIndex] ? storeEl.options[storeEl.selectedIndex].text : '—');
      var rows = [
        ['店舗',  storeName],
        ['日時',  (document.getElementById('rm-date').value || '—') + ' ' + (rmSelTime || '—')],
        ['人数',  document.getElementById('rm-guests').value + '名'],
        ['お名前', document.getElementById('rm-name').value || '—'],
        ['電話',  document.getElementById('rm-phone').value || '—'],
        ['メール', document.getElementById('rm-email').value || '—'],
        ['ご要望', document.getElementById('rm-notes').value || 'なし']
      ];
      document.getElementById('rm-confirm-box').innerHTML = rows.map(function(r){
        return '<div class="rm-confirm-row"><span class="rm-confirm-label">' + escH(r[0]) + '</span><span>' + escH(r[1]) + '</span></div>';
      }).join('');
    }
  }

  function rmValidateStep2() {
    var ok = true;
    var name  = document.getElementById('rm-name').value.trim();
    var phone = document.getElementById('rm-phone').value.trim();
    var email = document.getElementById('rm-email').value.trim();
    if (!name)  { rmShowErr('rm-name',  'お名前を入力してください'); ok=false; }
    if (!phone || !/^[0-9\-+]{7,15}$/.test(phone)) { rmShowErr('rm-phone', '正しい電話番号を入力してください'); ok=false; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { rmShowErr('rm-email', '正しいメールアドレスを入力してください'); ok=false; }
    if (ok) rmGoStep(3);
  }

  function rmShowErr(id, msg) {
    var el = document.getElementById('err-' + id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }

  function rmClearErr(id) {
    var el = document.getElementById('err-' + id);
    if (el) el.classList.remove('show');
  }

  async function rmSubmit() {
    var submitBtn = document.querySelector('#rmstep-3 .rm-btn:last-child');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '送信中...'; }
    try {
      var storeSelect = document.getElementById('rm-store');
      var storeId = storeSelect.value;
      if (rmPresetStore) {
        var brand = window.AidenCommon && window.AidenCommon.brand;
        if (brand && brand.id) {
          var client = getSb();
          if (client) {
            var rv = await client.from('venues_public').select('id').eq('brand_id', brand.id).eq('name', rmPresetStore).limit(1);
            storeId = (rv.data && rv.data[0]) ? rv.data[0].id : '';
          }
        }
      }
      var res = await fetch(SUPABASE_URL + '/functions/v1/create-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          date: document.getElementById('rm-date').value,
          time: rmSelTime,
          guest_count: parseInt(document.getElementById('rm-guests').value, 10),
          name: document.getElementById('rm-name').value.trim(),
          phone: document.getElementById('rm-phone').value.trim(),
          email: document.getElementById('rm-email').value.trim(),
          notes: document.getElementById('rm-notes').value.trim() || undefined
        })
      });
      var json = await res.json();
      if (!res.ok || !json.success) {
        alert('予約の送信に失敗しました: ' + (json.error || '不明なエラー'));
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '予約を確定する'; }
        return;
      }
      document.getElementById('rmstep-3').style.display = 'none';
      document.getElementById('rm-res-id').textContent = json.reservation.display_id;
      document.getElementById('rmstep-complete').style.display = 'block';
    } catch (e) {
      alert('予約の送信に失敗しました。通信状況をご確認ください。');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '予約を確定する'; }
    }
  }

  window.openResModal = openResModal;
  window.closeResModal = closeResModal;
  window.rmOnStoreChange = rmOnStoreChange;
  window.rmSelSlot = rmSelSlot;
  window.rmCheckCap = rmCheckCap;
  window.rmOpenVacancy = rmOpenVacancy;
  window.rmGoStep = rmGoStep;
  window.rmValidateStep2 = rmValidateStep2;
  window.rmShowErr = rmShowErr;
  window.rmClearErr = rmClearErr;
  window.rmSubmit = rmSubmit;

  /* =============================================================
     18. renderFooter(brand) — footer generation
     ============================================================= */
  function renderFooter(brand) {
    var el = document.getElementById('weir-footer');
    if (!el) return;
    if (!brand) return;

    var brandName = escH(brand.name || '');
    var brandDesc = escH(brand.brand_description || '');

    // Logo mark for footer
    var footerLogoMark = '';
    if (brand.logo_mark_type === 'image' && brand.logo_mark_src) {
      footerLogoMark = '<div class="footer-logo-mark" style="width:36px;height:36px;background:var(--brand-primary);border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0"><img src="' + escH(brand.logo_mark_src) + '" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>';
    } else {
      footerLogoMark = '<div class="footer-logo-mark" style="width:36px;height:36px;background:var(--brand-primary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;color:white;font-weight:700;flex-shrink:0">' + escH(brand.logo_mark_emoji || '') + '</div>';
    }

    // Company links — only show if URLs exist
    var companyLinksHtml = '';
    if (brand.company_url) {
      companyLinksHtml += '<a href="' + escH(brand.company_url) + '" target="_blank" rel="noopener" data-i18n="footer_company">' + t('footer_company') + '</a>';
    }
    if (brand.recruit_url) {
      companyLinksHtml += '<a href="' + escH(brand.recruit_url) + '" target="_blank" rel="noopener" data-i18n="footer_recruit">' + t('footer_recruit') + '</a>';
    }
    if (!companyLinksHtml) {
      companyLinksHtml = '<span style="font-size:12px;color:var(--text3)">—</span>';
    }

    var year = new Date().getFullYear();

    var html =
      '<div class="footer-main">' +
        // Column 1: Brand description
        '<div>' +
          '<div class="footer-logo">' + footerLogoMark + '<div class="footer-logo-text">' + brandName + '</div></div>' +
          '<div class="footer-brand-desc" data-i18n="footer_desc">' + brandDesc + '</div>' +
        '</div>' +
        // Column 2: Menu
        '<div>' +
          '<div class="footer-nav-title" data-i18n="footer_menu">' + t('footer_menu') + '</div>' +
          '<div class="footer-nav-list">' +
            '<a href="' + buildBrandPath(brand, '/menu') + '" data-i18n="f_grand_menu">' + t('f_grand_menu') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/menu') + '" data-i18n="f_yakiniku">' + t('f_yakiniku') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/menu') + '" data-i18n="f_rice">' + t('f_rice') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/menu') + '" data-i18n="f_drink">' + t('f_drink') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/menu') + '" data-i18n="f_course">' + t('f_course') + '</a>' +
          '</div>' +
        '</div>' +
        // Column 3: Service
        '<div>' +
          '<div class="footer-nav-title" data-i18n="footer_service">' + t('footer_service') + '</div>' +
          '<div class="footer-nav-list">' +
            '<a href="javascript:void(0)" data-i18n="cta_reserve" onclick="if(window.openResModal)openResModal()">' + t('cta_reserve') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/order') + '?mode=takeout" data-i18n="cta_takeout">' + t('cta_takeout') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/order') + '?mode=delivery" data-i18n="cta_delivery">' + t('cta_delivery') + '</a>' +
          '</div>' +
        '</div>' +
        // Column 4: Company + News
        '<div>' +
          '<div class="footer-nav-title" data-i18n="footer_company">' + t('footer_company') + '</div>' +
          '<div class="footer-nav-list" id="footer-company-links">' + companyLinksHtml + '</div>' +
          '<div class="footer-nav-title" style="margin-top:16px" data-i18n="footer_news">' + t('footer_news') + '</div>' +
          '<div class="footer-nav-list"><a href="' + buildBrandPath(brand, '/news') + '" data-i18n="news_more_link">' + t('news_more_link') + '</a></div>' +
        '</div>' +
        // Column 5: FAQ/Contact
        '<div>' +
          '<div class="footer-nav-title">' + t('footer_service') + '</div>' +
          '<div class="footer-nav-list">' +
            '<a href="' + buildBrandPath(brand, '/sitemap') + '" data-i18n="f_faq">' + t('f_faq') + '</a>' +
            '<a href="' + buildBrandPath(brand, '/sitemap') + '" data-i18n="f_contact">' + t('f_contact') + '</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Bottom bar
      '<div class="footer-bottom">' +
        '<div class="footer-bottom-inner">' +
          '<span class="footer-copyright">&copy; ' + year + ' ' + brandName + ' All rights reserved.</span>' +
          '<div class="footer-bottom-links">' +
            '<a href="/legal/privacy" data-i18n="f_privacy">' + t('f_privacy') + '</a>' +
            '<a href="/legal/terms" data-i18n="f_terms">' + t('f_terms') + '</a>' +
            '<a href="/legal/sitemap" data-i18n="f_sitemap">' + t('f_sitemap') + '</a>' +
          '</div>' +
          '<span class="powered">Powered by Weir</span>' +
        '</div>' +
      '</div>';

    el.className = 'weir-footer';
    el.innerHTML = html;
  }

  /* =============================================================
     19. toggleNav() — mobile nav toggle
     ============================================================= */
  function toggleNav() {
    var nav = document.getElementById('mobile-nav');
    var btn = document.getElementById('hamburger');
    if (!nav || !btn) return;
    nav.classList.toggle('open');
    btn.textContent = nav.classList.contains('open') ? '✕' : '☰';
  }

  // Outside click handler for mobile nav
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#mobile-nav') && !e.target.closest('#hamburger')) {
      var nav = document.getElementById('mobile-nav');
      var btn = document.getElementById('hamburger');
      if (nav && nav.classList.contains('open')) {
        nav.classList.remove('open');
        if (btn) btn.textContent = '☰';
      }
    }
  });

  /* =============================================================
     20. init(options) — main entry point
     ============================================================= */
  async function init(options) {
    options = options || {};
    var headerType = options.header !== undefined ? options.header : 'brand';
    var showFooter = options.footer !== undefined ? options.footer : true;

    // Restore language from sessionStorage
    var savedLang = sessionStorage.getItem('weir_lang');
    if (savedLang && I18N[savedLang]) {
      AidenCommon.lang = savedLang;
    }

    var resolved = await resolveBrandId();
    var timedOut = false;
    var brandLoaded = false;

    // Timeout handler — show with neutral colors
    var timer = setTimeout(function() {
      timedOut = true;
      if (!brandLoaded) {
        // Show page with neutral colors (CSS variable defaults)
        document.body.classList.add('weir-ready');
      }
    }, TIMEOUT_MS);

    // Load brand data
    loadBrand(resolved).then(function(brand) {
      brandLoaded = true;
      clearTimeout(timer);

      // brand=null: ブランド解決失敗 → 404 的表示
      if (!brand) {
        showNotFound();
        document.body.classList.add('weir-ready');
        return;
      }

      // Apply brand CSS
      applyBrandCSS(brand);

      // Render header
      if (headerType === 'brand') {
        renderHeaderBrand(brand);
        // 来店予約モーダル auto-inject (brand header のあるページのみ)
        injectReservationModalCSS();
        injectReservationModalDOM();
      } else if (headerType === 'order') {
        renderHeaderOrder(brand, options);
      }

      // Render footer
      if (showFooter) {
        renderFooter(brand);
      }

      // Apply saved language
      if (AidenCommon.lang !== 'ja') {
        changeLang(AidenCommon.lang);
      }

      // Store brand reference
      AidenCommon.brand = brand;

      // Callback
      if (typeof options.onBrandLoaded === 'function') {
        options.onBrandLoaded(brand);
      }

      // Ensure page is visible
      document.body.classList.add('weir-ready');

    }).catch(function(err) {
      brandLoaded = true;
      clearTimeout(timer);

      // エラー時（RLS拒否・ネットワーク障害等）も 404 的表示で安全側
      showNotFound();
      document.body.classList.add('weir-ready');
    });
  }

  /* =============================================================
     Public API — window.AidenCommon
     ============================================================= */
  window.AidenCommon = {
    lang: 'ja',
    brand: null,

    // Core
    escH: escH,
    getSb: getSb,
    resolveBrandId: resolveBrandId,
    loadBrand: loadBrand,
    applyBrandCSS: applyBrandCSS,
    buildBrandPath: buildBrandPath,

    // i18n
    I18N: I18N,
    addTranslations: addTranslations,
    t: t,
    changeLang: changeLang,

    // Header / Footer
    renderHeaderBrand: renderHeaderBrand,
    renderHeaderOrder: renderHeaderOrder,
    renderFooter: renderFooter,
    toggleNav: toggleNav,

    // Init
    init: init
  };

})();
