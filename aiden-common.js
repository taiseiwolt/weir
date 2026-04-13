/* =============================================================
   aiden-common.js — AIden 共通基盤
   Brand loading, i18n, Header/Footer generation, init()
   Usage: <script src="aiden-common.js"></script>
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

  var BRAND_COLUMNS = 'id,name,display_id,memo,font_family,font_color,primary_color,primary_dark,primary_light,header_bg,header_text_color,logo_mark_type,logo_mark_emoji,logo_mark_src,logo_text_type,logo_text_value,sns_line,sns_x,sns_instagram,sns_facebook,sns_tiktok,sns_youtube,sns_threads,company_url,recruit_url,hero_catchphrase,brand_description,custom_domain';

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
    if (hostname && hostname !== 'localhost' && hostname !== 'aiden-jp.net' && !hostname.endsWith('.vercel.app')) {
      var client = getSb();
      if (client) {
        try {
          var res = await client.from('brands').select('id').eq('custom_domain', hostname).limit(1);
          if (res.data && res.data.length > 0) return { type: 'id', value: res.data[0].id };
        } catch (e) { /* fall through */ }
      }
    }

    // 2. URL parameters
    var params = new URLSearchParams(window.location.search);
    var brandIdParam = params.get('brand_id');
    if (brandIdParam) return { type: 'id', value: brandIdParam };

    var brandSlug = params.get('brand');
    if (brandSlug) {
      // Resolve slug via store table (brands table has no slug column)
      var client = getSb();
      if (client) {
        try {
          // Try venue slug prefix match
          var prefix = brandSlug.split('-')[0];
          var res = await client.from('venues').select('brand_id').ilike('slug', prefix + '-%').limit(1);
          if (res.data && res.data.length > 0) return { type: 'id', value: res.data[0].brand_id };
          // Try exact venue slug match
          var exact = await client.from('venues').select('brand_id').eq('slug', brandSlug).limit(1);
          if (exact.data && exact.data.length > 0) return { type: 'id', value: exact.data[0].brand_id };
        } catch (e) { /* fall through to default */ }
      }
      // Slug didn't resolve — fall through to sessionStorage / default
    }

    // 3. sessionStorage
    var stored = sessionStorage.getItem('aiden_brand_id');
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

    var query = client.from('brands').select(BRAND_COLUMNS).eq('id', resolved.value);

    return query.single().then(function(res) {
      if (res.error) throw res.error;
      var brand = res.data;
      if (brand && brand.id) {
        sessionStorage.setItem('aiden_brand_id', brand.id);
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
    sessionStorage.setItem('aiden_lang', lang);

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
     11. buildBrandParam(brand) — helper to build URL query param
     ============================================================= */
  function buildBrandParam(brand) {
    if (brand && brand.id) return '?brand_id=' + encodeURIComponent(brand.id);
    return '';
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
    var el = document.getElementById('aiden-header');
    if (!el) return;

    var bp = buildBrandParam(brand);
    var active = detectActivePage();
    var brandName = escH(brand.name || '');

    // Build nav links with active state
    var menuClass = 'header-nav-link' + (active === 'menu' ? ' active' : '');
    var storesClass = 'header-nav-link' + (active === 'stores' ? ' active' : '');
    var membershipClass = 'header-nav-link' + (active === 'membership' ? ' active' : '');

    var html = '<header class="header">' +
      '<div class="header-main">' +
        '<div class="header-logo">' +
          '<a href="./brand.html' + bp + '">' +
            '<span style="display:flex;align-items:center;gap:10px">' +
              renderLogoMark(brand) +
              renderLogoText(brand) +
            '</span>' +
          '</a>' +
        '</div>' +
        '<nav class="header-nav">' +
          '<a href="./aiden-brand-menu.html' + bp + '" class="' + menuClass + '" data-i18n="nav_menu">' + t('nav_menu') + '</a>' +
          '<a href="./aiden-brand-stores.html' + bp + '" class="' + storesClass + '" data-i18n="nav_stores">' + t('nav_stores') + '</a>' +
          '<a href="./aiden-membership.html' + (brand.id ? '?brand_id=' + encodeURIComponent(brand.id) : bp) + '" class="' + membershipClass + '" data-i18n="nav_membership" id="nav-membership-link">' + t('nav_membership') + '</a>' +
          '<a href="javascript:void(0)" class="header-nav-link cta" data-i18n="nav_reserve" onclick="if(window.openResModal)openResModal()">' + t('nav_reserve') + '</a>' +
          '<a href="./aiden-order.html' + bp + '" class="header-nav-link cta" data-i18n="nav_order">' + t('nav_order') + '</a>' +
        '</nav>' +
        buildLangSelect() +
        '<button class="header-hamburger" id="hamburger" onclick="AidenCommon.toggleNav()">☰</button>' +
      '</div>' +
    '</header>' +
    '<div class="mobile-nav" id="mobile-nav">' +
      '<div class="mobile-nav-cta">' +
        '<a href="javascript:void(0)" data-i18n="nav_reserve" onclick="if(window.openResModal)openResModal()">' + t('nav_reserve') + '</a>' +
        '<a href="./aiden-order.html' + bp + '" data-i18n="nav_order_short">' + t('nav_order_short') + '</a>' +
        '<a href="./aiden-order.html' + bp + (bp ? '&' : '?') + 'mode=delivery">' + t('cta_delivery') + '</a>' +
      '</div>' +
      '<a href="./aiden-brand-menu.html' + bp + '" data-i18n="nav_menu">' + t('nav_menu') + '</a>' +
      '<a href="./aiden-brand-stores.html' + bp + '" data-i18n="nav_stores">📍 ' + t('nav_stores') + '</a>' +
      '<a href="./aiden-membership.html' + (brand.id ? '?brand_id=' + encodeURIComponent(brand.id) : bp) + '" data-i18n="nav_membership">🏆 ' + t('nav_membership') + '</a>' +
    '</div>';

    el.innerHTML = html;
  }

  /* =============================================================
     17. renderHeaderOrder(brand, options) — Type B header
     ============================================================= */
  function renderHeaderOrder(brand, options) {
    var el = document.getElementById('aiden-header');
    if (!el) return;

    options = options || {};

    var html = '<header class="header header--order">' +
      '<div class="header-main">' +
        '<button class="header-back" id="aiden-header-back" data-i18n="back" aria-label="' + t('back') + '">←</button>' +
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
          '<button class="header-cart" id="aiden-header-cart" style="display:none" aria-label="' + t('cart') + '">' +
            '🛒<span class="header-cart-badge" id="aiden-cart-badge" style="display:none">0</span>' +
          '</button>' +
          '<button class="header-signin" id="aiden-header-signin" data-i18n="signin">' + t('signin') + '</button>' +
        '</div>' +
      '</div>' +
    '</header>';

    el.innerHTML = html;

    // Add body class for padding-top
    document.body.classList.add('aiden-order-body');

    // Attach back button handler
    var backBtn = document.getElementById('aiden-header-back');
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
     18. renderFooter(brand) — footer generation
     ============================================================= */
  function renderFooter(brand) {
    var el = document.getElementById('aiden-footer');
    if (!el) return;

    var bp = buildBrandParam(brand);
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
            '<a href="./aiden-brand-menu.html' + bp + '" data-i18n="f_grand_menu">' + t('f_grand_menu') + '</a>' +
            '<a href="./aiden-brand-menu.html' + bp + '" data-i18n="f_yakiniku">' + t('f_yakiniku') + '</a>' +
            '<a href="./aiden-brand-menu.html' + bp + '" data-i18n="f_rice">' + t('f_rice') + '</a>' +
            '<a href="./aiden-brand-menu.html' + bp + '" data-i18n="f_drink">' + t('f_drink') + '</a>' +
            '<a href="./aiden-brand-menu.html' + bp + '" data-i18n="f_course">' + t('f_course') + '</a>' +
          '</div>' +
        '</div>' +
        // Column 3: Service
        '<div>' +
          '<div class="footer-nav-title" data-i18n="footer_service">' + t('footer_service') + '</div>' +
          '<div class="footer-nav-list">' +
            '<a href="javascript:void(0)" data-i18n="cta_reserve" onclick="if(window.openResModal)openResModal()">' + t('cta_reserve') + '</a>' +
            '<a href="./aiden-order.html' + bp + (bp ? '&' : '?') + 'mode=takeout" data-i18n="cta_takeout">' + t('cta_takeout') + '</a>' +
            '<a href="./aiden-order.html' + bp + (bp ? '&' : '?') + 'mode=delivery" data-i18n="cta_delivery">' + t('cta_delivery') + '</a>' +
          '</div>' +
        '</div>' +
        // Column 4: Company + News
        '<div>' +
          '<div class="footer-nav-title" data-i18n="footer_company">' + t('footer_company') + '</div>' +
          '<div class="footer-nav-list" id="footer-company-links">' + companyLinksHtml + '</div>' +
          '<div class="footer-nav-title" style="margin-top:16px" data-i18n="footer_news">' + t('footer_news') + '</div>' +
          '<div class="footer-nav-list"><a href="./aiden-brand-news.html' + bp + '" data-i18n="news_more_link">' + t('news_more_link') + '</a></div>' +
        '</div>' +
        // Column 5: FAQ/Contact
        '<div>' +
          '<div class="footer-nav-title">' + t('footer_service') + '</div>' +
          '<div class="footer-nav-list">' +
            '<a href="./aiden-sitemap.html' + bp + '" data-i18n="f_faq">' + t('f_faq') + '</a>' +
            '<a href="./aiden-sitemap.html' + bp + '" data-i18n="f_contact">' + t('f_contact') + '</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Bottom bar
      '<div class="footer-bottom">' +
        '<div class="footer-bottom-inner">' +
          '<span class="footer-copyright">&copy; ' + year + ' ' + brandName + ' All rights reserved.</span>' +
          '<div class="footer-bottom-links">' +
            '<a href="./aiden-privacy.html' + bp + '" data-i18n="f_privacy">' + t('f_privacy') + '</a>' +
            '<a href="./aiden-terms.html' + bp + '" data-i18n="f_terms">' + t('f_terms') + '</a>' +
            '<a href="./aiden-sitemap.html' + bp + '" data-i18n="f_sitemap">' + t('f_sitemap') + '</a>' +
          '</div>' +
          '<span class="powered">Powered by AIden</span>' +
        '</div>' +
      '</div>';

    el.className = 'aiden-footer';
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
    var savedLang = sessionStorage.getItem('aiden_lang');
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
        document.body.classList.add('aiden-ready');
      }
    }, TIMEOUT_MS);

    // Load brand data
    loadBrand(resolved).then(function(brand) {
      brandLoaded = true;
      clearTimeout(timer);

      // Apply brand CSS
      applyBrandCSS(brand);

      // Render header
      if (headerType === 'brand') {
        renderHeaderBrand(brand);
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
      document.body.classList.add('aiden-ready');

    }).catch(function(err) {
      brandLoaded = true;
      clearTimeout(timer);

      // On error, show with neutral colors
      document.body.classList.add('aiden-ready');
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
