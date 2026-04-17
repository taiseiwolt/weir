// middleware.js - Vercel Edge Middleware
// - admin.weir.co.jp の host-based routing（/ → 管理マスタ、/customer → 顧客管理）
// - xorder.co.jp のワイルドカードサブドメインルーティング

import { rewrite } from '@vercel/functions';

export const config = {
  matcher: '/(.*)',
};

export default function middleware(request) {
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

  // 管理ドメイン・localhost・vercel.app はスルー
  if (
    hostname === ADMIN_DOMAIN ||
    hostname === 'www.' + ADMIN_DOMAIN ||
    hostname.endsWith('.vercel.app') ||
    hostname.includes('localhost')
  ) {
    return;
  }

  // *.xorder.co.jp のサブドメインを抽出
  if (hostname.endsWith('.' + SHARED_DOMAIN)) {
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
}
