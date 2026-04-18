// middleware.js - Vercel Edge Middleware
// - admin.weir.co.jp の host-based routing（/ → 管理マスタ、/customer → 顧客管理）
// - xorder.co.jp のワイルドカードサブドメインルーティング
// - Phase 2-a: brand slug 存在チェック（不存在なら /404.html へ rewrite）

import { rewrite } from '@vercel/functions';

export const config = {
  matcher: '/(.*)',
};

// First URL segment が以下のいずれかなら DB チェックをスキップ
const RESERVED_FIRST_SEGMENTS = new Set([
  'api', 'legal', 'public', 'docs', '_next', 'static',
  '404', 'index', 'favicon.ico', 'robots.txt', 'sitemap.xml',
  'verify-email', 'reset-password',
  'menu', 'stores', 'membership', 'news', 'sitemap',
  'privacy', 'terms', 'tokushoho', 'order', 'mypage',
  'tracking', 'guest-order',
]);

// これらの prefix で始まる first segment も DB チェックをスキップ
// 注: 'brand' は含めない。brand.html は includes('.') でスキップされ、
//     'brand' 始まりの正規ブランドslugの 404 チェックは通すため。
const RESERVED_PREFIXES = [
  'weir-', 'aiden-', 'test-', 'e2e-', 'playwright-', 'seed-', 'qa-',
];

// Phase 2-a Task 12: legacy /weir-*.html → new brand-scoped subpath
const LEGACY_BRAND_PATH_MAP = {
  '/brand.html': '',
  '/weir-brand-menu.html': '/menu',
  '/weir-brand-stores.html': '/stores',
  '/weir-membership.html': '/membership',
  '/weir-brand-news.html': '/news',
  '/weir-order.html': '/order',
  '/weir-mypage.html': '/mypage',
  '/weir-order-tracking.html': '/tracking',
  '/weir-sitemap.html': '/sitemap',
};

// Edge Runtime の module-scope cache。インスタンス生存中は保持される
const brandSlugCache = new Map();
const BRAND_CACHE_TTL_MS = 60 * 1000;

// Phase 2-a Task 12: brand_id → slug cache for legacy URL 301 redirects
const brandIdToSlugCache = new Map();

async function brandSlugById(brandId) {
  const now = Date.now();
  const cached = brandIdToSlugCache.get(brandId);
  if (cached && now - cached.ts < BRAND_CACHE_TTL_MS) {
    return cached.slug;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    const res = await fetch(
      supabaseUrl + '/rest/v1/brands?select=slug&id=eq.' + encodeURIComponent(brandId) + '&limit=1',
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: 'Bearer ' + supabaseAnonKey,
        },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const slug = (Array.isArray(rows) && rows.length > 0 && rows[0].slug) ? rows[0].slug : null;
    if (slug) brandIdToSlugCache.set(brandId, { slug, ts: now });
    return slug;
  } catch {
    return null;
  }
}

async function brandSlugExists(slug) {
  const now = Date.now();
  const cached = brandSlugCache.get(slug);
  if (cached && now - cached.ts < BRAND_CACHE_TTL_MS) {
    return cached.exists;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // env 欠損時は fail open（サイト全体が 404 になるのを防ぐ）
    return true;
  }

  try {
    const res = await fetch(
      supabaseUrl + '/rest/v1/brands?select=slug&slug=eq.' + encodeURIComponent(slug) + '&limit=1',
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: 'Bearer ' + supabaseAnonKey,
        },
      }
    );
    if (!res.ok) return true; // fail open
    const rows = await res.json();
    const exists = Array.isArray(rows) && rows.length > 0;
    brandSlugCache.set(slug, { exists, ts: now });
    return exists;
  } catch {
    return true; // fail open on any error
  }
}

function shouldCheckBrandSlug(pathname) {
  const segs = pathname.split('/');
  // pathname は '/' で始まるので segs[0] は '' で segs[1] が first segment
  const first = segs[1];
  if (!first) return null; // root path
  if (first.includes('.')) return null; // static file
  if (RESERVED_FIRST_SEGMENTS.has(first)) return null;
  for (const prefix of RESERVED_PREFIXES) {
    if (first.startsWith(prefix)) return null;
  }
  return first;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // admin.weir.co.jp: filesystem優先で vercel.json rewrite が効かないため middleware で対応
  if (hostname === 'admin.weir.co.jp') {
    if (pathname === '/') {
      return rewrite(new URL('/weir-admin.html', request.url));
    }
    if (pathname === '/customer' || pathname.startsWith('/customer/')) {
      return rewrite(new URL('/weir-customer-admin.html', request.url));
    }
    return;
  }

  const SHARED_DOMAIN = 'xorder.co.jp';
  const ADMIN_DOMAIN = 'xorder.co.jp';

  // メインドメイン判定（apex / www / vercel.app / localhost）
  const isMainApex =
    hostname === ADMIN_DOMAIN ||
    hostname === 'www.' + ADMIN_DOMAIN ||
    hostname.endsWith('.vercel.app') ||
    hostname.includes('localhost');

  // *.xorder.co.jp のサブドメインを抽出（メインドメイン以外）
  if (!isMainApex && hostname.endsWith('.' + SHARED_DOMAIN)) {
    const brandSlug = hostname.slice(0, -(SHARED_DOMAIN.length + 1));

    // 空・www はスルー
    if (!brandSlug || brandSlug === 'www') return;

    // brand.html にリライト
    const rewriteUrl = new URL(
      '/brand.html?brand=' + encodeURIComponent(brandSlug),
      request.url
    );
    rewriteUrl.host = ADMIN_DOMAIN;
    rewriteUrl.protocol = 'https:';

    return Response.redirect(rewriteUrl.toString(), 307);
  }

  // Phase 2-a: メインドメインでの path-based brand slug チェック
  // first segment が reserved でなければ brands.slug の存在を確認し、不在なら /404.html
  if (isMainApex) {
    // Phase 2-a Task 12: legacy /weir-*.html?brand_id=X → 301 /{slug}/{subpath}
    if (LEGACY_BRAND_PATH_MAP.hasOwnProperty(pathname)) {
      const brandId = url.searchParams.get('brand_id');
      if (brandId) {
        const slug = await brandSlugById(brandId);
        if (slug) {
          const newPath = '/' + slug + LEGACY_BRAND_PATH_MAP[pathname];
          // Preserve other query params (strip brand_id) and fragment
          const preservedParams = new URLSearchParams();
          url.searchParams.forEach((v, k) => {
            if (k !== 'brand_id') preservedParams.append(k, v);
          });
          const qs = preservedParams.toString();
          const newUrl = newPath + (qs ? '?' + qs : '') + (url.hash || '');
          return Response.redirect(new URL(newUrl, request.url).toString(), 301);
        }
        // brand_id provided but lookup failed — fall through to 404 logic below
      }
      // No brand_id — legacy URL still served by Vercel filesystem, OK to let it through
    }

    const slug = shouldCheckBrandSlug(pathname);
    if (slug) {
      const exists = await brandSlugExists(slug);
      if (!exists) {
        return rewrite(new URL('/404.html', request.url));
      }
    }
  }
}
