// middleware.js - Vercel Edge Middleware
// xorder.co.jp のワイルドカードサブドメインルーティング

export const config = {
  matcher: '/(.*)',
};

export default function middleware(request) {
  const url = new URL(request.url);
  const hostname = request.headers.get('host') || '';

  const SHARED_DOMAIN = 'xorder.co.jp';
  const ADMIN_DOMAIN = 'weir.co.jp';

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
