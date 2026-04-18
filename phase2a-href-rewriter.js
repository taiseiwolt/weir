// phase2a-href-rewriter.js
// Rewrites legacy `./weir-*.html` / `./brand.html` (+ absolute `/weir-*.html`)
// hrefs to Phase 2-a slug-based paths on DOMContentLoaded.
// Extracts brand_slug from window.location.pathname first segment.
// Legal (/legal/privacy etc.), auth (/verify-email, /reset-password) hrefs
// become absolute paths with no brand context.
// Strips ?brand_id=... query parameters (Phase 2-a reads from pathname).
(function () {
  'use strict';

  var RESERVED_FIRST_SEGMENTS = {
    'api': 1, 'legal': 1, 'verify-email': 1, 'reset-password': 1,
    '404': 1, 'index': 1, 'public': 1, 'docs': 1, '_next': 1, 'static': 1,
    'favicon.ico': 1, 'robots.txt': 1, 'sitemap.xml': 1
  };
  var RESERVED_PREFIX_RE = /^(weir-|aiden-|test-|e2e-|playwright-|seed-|qa-)/;

  function getBrandSlug() {
    var m = window.location.pathname.match(/^\/([^\/]+)/);
    if (!m) return '';
    var first = m[1];
    if (first.indexOf('.') !== -1) return '';
    if (RESERVED_FIRST_SEGMENTS[first]) return '';
    if (RESERVED_PREFIX_RE.test(first)) return '';
    return first;
  }

  function buildBrandPath(sub) {
    var slug = getBrandSlug();
    return slug ? '/' + slug + sub : sub || '/';
  }

  // Base paths → new path-under-brand (relative to buildBrandPath)
  var BRAND_MAP = {
    './brand.html': '',
    '/brand.html': '',
    './weir-brand-menu.html': '/menu',
    '/weir-brand-menu.html': '/menu',
    './weir-brand-stores.html': '/stores',
    '/weir-brand-stores.html': '/stores',
    './weir-membership.html': '/membership',
    '/weir-membership.html': '/membership',
    './weir-brand-news.html': '/news',
    '/weir-brand-news.html': '/news',
    './weir-order.html': '/order',
    '/weir-order.html': '/order',
    './weir-mypage.html': '/mypage',
    '/weir-mypage.html': '/mypage',
    './weir-mypage-membership.html': '/mypage/membership',
    '/weir-mypage-membership.html': '/mypage/membership',
    './weir-order-tracking.html': '/tracking',
    '/weir-order-tracking.html': '/tracking',
    './weir-sitemap.html': '/sitemap',
    '/weir-sitemap.html': '/sitemap'
  };

  // Base paths → absolute (no brand context)
  var LEGAL_MAP = {
    './weir-terms.html': '/legal/terms',
    '/weir-terms.html': '/legal/terms',
    './weir-privacy.html': '/legal/privacy',
    '/weir-privacy.html': '/legal/privacy',
    './weir-privacy-policy.html': '/legal/privacy',
    '/weir-privacy-policy.html': '/legal/privacy',
    './weir-tokushoho.html': '/legal/tokushoho',
    '/weir-tokushoho.html': '/legal/tokushoho',
    './weir-email-verified.html': '/verify-email',
    '/weir-email-verified.html': '/verify-email',
    './weir-email-pending.html': '/verify-email/pending',
    '/weir-email-pending.html': '/verify-email/pending',
    './weir-password-reset.html': '/reset-password',
    '/weir-password-reset.html': '/reset-password'
  };

  function stripBrandIdQuery(suffix) {
    if (!suffix) return '';
    // Remove &brand_id=X or ?brand_id=X
    var cleaned = suffix.replace(/([?&])brand_id=[^&#]*&?/g, '$1');
    cleaned = cleaned.replace(/\?&/g, '?').replace(/&&/g, '&');
    cleaned = cleaned.replace(/[?&]$/, '');
    return cleaned;
  }

  function rewriteHref(href) {
    if (!href) return null;
    if (/^(https?:)?\/\//.test(href)) return null; // external URL
    if (href.charAt(0) === '#') return null;        // fragment-only
    if (href.charAt(0) === '?') return null;        // query-only
    if (/^(mailto:|tel:|javascript:)/.test(href)) return null;

    var sepIdx = href.search(/[?#]/);
    var basePath = sepIdx === -1 ? href : href.substring(0, sepIdx);
    var suffix = sepIdx === -1 ? '' : href.substring(sepIdx);

    suffix = stripBrandIdQuery(suffix);

    if (BRAND_MAP.hasOwnProperty(basePath)) {
      return buildBrandPath(BRAND_MAP[basePath]) + suffix;
    }
    if (LEGAL_MAP.hasOwnProperty(basePath)) {
      return LEGAL_MAP[basePath] + suffix;
    }
    return null;
  }

  function rewriteAll() {
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var h = a.getAttribute('href');
      var newHref = rewriteHref(h);
      if (newHref !== null && newHref !== h) {
        a.setAttribute('href', newHref);
      }
    }
  }

  // Expose for programmatic use (e.g., after dynamic DOM injection)
  window.Phase2aHrefRewriter = {
    rewriteAll: rewriteAll,
    rewriteHref: rewriteHref,
    getBrandSlug: getBrandSlug,
    buildBrandPath: buildBrandPath
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewriteAll);
  } else {
    rewriteAll();
  }
})();
