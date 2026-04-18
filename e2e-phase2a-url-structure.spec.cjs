// @ts-check
// Phase 2-a URL 構造刷新 実機検証用 Playwright spec
//
// ■ 使い方:
//   環境変数 BASE_URL に検証対象URLを指定して実行:
//     BASE_URL=https://xorder.co.jp npx playwright test e2e-phase2a-url-structure.spec.cjs
//   (BASE_URL を省略するとデフォルト https://xorder.co.jp を使用)
//
// ■ 必要な前提条件:
//   1. Phase 2-a 変更が対象環境に deploy 済み
//   2. brands.slug = 'izakaya-ushio' のブランドが DB に存在（seed data）
//   3. 該当ブランド配下に venue が 1 つ以上存在（DB から venue.slug を取得するテストあり）
//
// ■ テスト範囲（合計 25+ パターン）:
//   - [A] 正常系: brand-scoped URL 10 パターン
//   - [B] 正常系: brand + venue URL 3 パターン
//   - [C] 正常系: legal / auth URL 6 パターン
//   - [D] 異常系: 存在しない slug の 404 挙動
//   - [E] 旧URL → 新URL 301 リダイレクト 5 パターン
//   - [F] ヘッダー / フッター リンク確認（ブランドページで全リンク遷移可能）
//
// ■ ブランド slug の変更:
//   デフォルト TEST_BRAND_SLUG = 'izakaya-ushio'。
//   別ブランドで検証する場合は環境変数 TEST_BRAND_SLUG で上書き可能。

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://xorder.co.jp';
const TEST_BRAND_SLUG = process.env.TEST_BRAND_SLUG || 'izakaya-ushio';
const TEST_BRAND_ID = process.env.TEST_BRAND_ID || ''; // 旧URL 301 テストで使う UUID（optional）

const PAGE_TIMEOUT = 30000;

// Helper: Navigate and verify status + not 404 content
async function gotoAndExpect200(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  expect(response, `goto failed: ${url}`).toBeTruthy();
  const status = response.status();
  expect(status, `expected 200-ish for ${url}, got ${status}`).toBeLessThan(400);

  // 404.html の目印文字列が出ていないことを確認（catch-all 404 rewrite を検出）
  const bodyText = await page.textContent('body');
  expect(bodyText).not.toContain('404');
  expect(bodyText).not.toContain('ページが見つかりません');
}

// Helper: Verify status is a specific 3xx / 4xx
async function gotoAndExpectStatus(page, url, expectedStatus, followRedirects = false) {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: PAGE_TIMEOUT
  });
  if (followRedirects) {
    expect(response.status()).toBe(expectedStatus);
  } else {
    // Can't easily prevent redirect follow in Playwright — use request context instead
    const reqCtx = await page.context().request;
    const reqRes = await reqCtx.get(url, { maxRedirects: 0 }).catch((e) => e.response);
    expect(reqRes.status(), `${url} expected ${expectedStatus}`).toBe(expectedStatus);
  }
}

// Helper: Verify redirect target (follow redirect manually)
async function expectRedirectTo(page, fromUrl, expectedToPath, expectedStatus = 301) {
  const reqCtx = await page.context().request;
  const reqRes = await reqCtx.fetch(fromUrl, { maxRedirects: 0 }).catch((e) => e.response);
  expect(reqRes.status(), `${fromUrl} expected ${expectedStatus} redirect`).toBe(expectedStatus);
  const location = reqRes.headers()['location'];
  expect(location, `${fromUrl} missing Location header`).toBeTruthy();
  // Location can be absolute or relative — compare path suffix
  expect(location).toContain(expectedToPath);
}

test.describe('Phase 2-a URL Structure — [A] Brand-scoped positive', () => {
  test('A-01: /{brand_slug} → brand.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}`);
    // ブランドトップの特徴要素
    await expect(page.locator('#weir-header, .header, header').first()).toBeVisible({ timeout: 10000 });
  });

  test('A-02: /{brand_slug}/menu → weir-brand-menu.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/menu`);
  });

  test('A-03: /{brand_slug}/menu?category=XXX → weir-brand-menu.html with filter', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/menu?category=yakiniku`);
  });

  test('A-04: /{brand_slug}/stores → weir-brand-stores.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/stores`);
  });

  test('A-05: /{brand_slug}/membership → weir-membership.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/membership`);
  });

  test('A-06: /{brand_slug}/news → weir-brand-news.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/news`);
  });

  test('A-07: /{brand_slug}/sitemap → weir-sitemap.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/sitemap`);
  });

  test('A-08: /{brand_slug}/mypage → weir-mypage.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/mypage`);
  });

  test('A-09: /{brand_slug}/order → weir-order.html (store selector)', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/order`);
  });

  test('A-10: /{brand_slug}/tracking?token=dummy → weir-order-tracking.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/tracking?token=dummy-token-for-routing-test`);
  });
});

test.describe('Phase 2-a URL Structure — [B] Brand + venue positive', () => {
  let venueSlug = '';

  test.beforeAll(async ({ request }) => {
    // venue.slug を DB から取得（anon REST API 経由）
    const supabaseUrl = process.env.SUPABASE_URL || 'https://iikwusprydaogzeslgdz.supabase.co';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseAnonKey) {
      // 環境変数未設定の場合は既知の venue slug を使う
      venueSlug = process.env.TEST_VENUE_SLUG || 'ra6DXDh';
      return;
    }
    try {
      const brandLookup = await request.get(
        `${supabaseUrl}/rest/v1/brands?select=id&slug=eq.${TEST_BRAND_SLUG}&limit=1`,
        { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } }
      );
      const brands = await brandLookup.json();
      if (brands && brands[0]) {
        const venueLookup = await request.get(
          `${supabaseUrl}/rest/v1/venues?select=slug&brand_id=eq.${brands[0].id}&limit=1`,
          { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } }
        );
        const venues = await venueLookup.json();
        if (venues && venues[0]) venueSlug = venues[0].slug;
      }
    } catch (e) {
      venueSlug = process.env.TEST_VENUE_SLUG || 'ra6DXDh';
    }
  });

  test('B-01: /{brand_slug}/{venue_slug} → weir-store.html', async ({ page }) => {
    test.skip(!venueSlug, 'venue slug unavailable');
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/${venueSlug}`);
  });

  test('B-02: /{brand_slug}/{venue_slug}/order → weir-order-store.html', async ({ page }) => {
    test.skip(!venueSlug, 'venue slug unavailable');
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/${venueSlug}/order`);
  });

  test('B-03: /{brand_slug}/{venue_slug}/checkout → weir-order-checkout.html', async ({ page }) => {
    test.skip(!venueSlug, 'venue slug unavailable');
    await gotoAndExpect200(page, `${BASE_URL}/${TEST_BRAND_SLUG}/${venueSlug}/checkout`);
  });
});

test.describe('Phase 2-a URL Structure — [C] Legal / auth positive', () => {
  test('C-01: /legal/privacy → weir-privacy.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/legal/privacy`);
  });

  test('C-02: /legal/terms → weir-terms.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/legal/terms`);
  });

  test('C-03: /legal/tokushoho → weir-tokushoho.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/legal/tokushoho`);
  });

  test('C-04: /verify-email → weir-email-verified.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/verify-email`);
  });

  test('C-05: /verify-email/pending → weir-email-pending.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/verify-email/pending`);
  });

  test('C-06: /reset-password → weir-password-reset.html', async ({ page }) => {
    await gotoAndExpect200(page, `${BASE_URL}/reset-password`);
  });
});

test.describe('Phase 2-a URL Structure — [D] Negative (404 behavior)', () => {
  test('D-01: /{nonexistent-slug} → 404 (middleware brand slug 404 check)', async ({ page }) => {
    const fakeSlug = 'slug-that-does-not-exist-xyz-' + Date.now();
    const response = await page.goto(`${BASE_URL}/${fakeSlug}`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    // middleware が rewrite to /404.html するので status は 200 + 404 コンテンツ
    // OR status 404（Vercel のエッジ挙動次第）
    const bodyText = await page.textContent('body');
    // 404 ページ固有の文字列のどれかが出ているはず
    const is404 =
      bodyText.includes('ページが見つかりません') ||
      bodyText.includes('404') ||
      response.status() === 404;
    expect(is404, `Expected 404 indication for /${fakeSlug}`).toBeTruthy();
  });

  test('D-02: /{nonexistent-slug}/menu → 404 (middleware blocks before rewrite)', async ({ page }) => {
    const fakeSlug = 'nope-' + Date.now();
    const response = await page.goto(`${BASE_URL}/${fakeSlug}/menu`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    const bodyText = await page.textContent('body');
    const is404 =
      bodyText.includes('ページが見つかりません') ||
      bodyText.includes('404') ||
      response.status() === 404;
    expect(is404).toBeTruthy();
  });
});

test.describe('Phase 2-a URL Structure — [E] Legacy URL 301 redirects', () => {
  test('E-01: /weir-email-verified.html → 301 /verify-email', async ({ page }) => {
    await expectRedirectTo(page, `${BASE_URL}/weir-email-verified.html`, '/verify-email', 308);
    // Vercel static redirect is actually 308 Permanent Redirect (not 301), both are "permanent"
  });

  test('E-02: /weir-password-reset.html → 301 /reset-password', async ({ page }) => {
    await expectRedirectTo(page, `${BASE_URL}/weir-password-reset.html`, '/reset-password', 308);
  });

  test('E-03: /weir-privacy.html → 301 /legal/privacy', async ({ page }) => {
    await expectRedirectTo(page, `${BASE_URL}/weir-privacy.html`, '/legal/privacy', 308);
  });

  test('E-04: /weir-terms.html → 301 /legal/terms', async ({ page }) => {
    await expectRedirectTo(page, `${BASE_URL}/weir-terms.html`, '/legal/terms', 308);
  });

  test('E-05: /weir-guest-order.html → 301 /', async ({ page }) => {
    await expectRedirectTo(page, `${BASE_URL}/weir-guest-order.html`, '/', 308);
  });

  test('E-06: /weir-brand-menu.html?brand_id=<UUID> → 301 /{slug}/menu (middleware dynamic)', async ({ page }) => {
    test.skip(!TEST_BRAND_ID, 'TEST_BRAND_ID not set — skip middleware dynamic redirect test');
    await expectRedirectTo(
      page,
      `${BASE_URL}/weir-brand-menu.html?brand_id=${TEST_BRAND_ID}`,
      `/${TEST_BRAND_SLUG}/menu`,
      301
    );
  });

  test('E-07: /brand.html?brand_id=<UUID> → 301 /{slug}', async ({ page }) => {
    test.skip(!TEST_BRAND_ID, 'TEST_BRAND_ID not set');
    await expectRedirectTo(
      page,
      `${BASE_URL}/brand.html?brand_id=${TEST_BRAND_ID}`,
      `/${TEST_BRAND_SLUG}`,
      301
    );
  });
});

test.describe('Phase 2-a URL Structure — [F] Header / Footer link navigation', () => {
  // 各ブランドページで、ヘッダー・フッター内のすべての <a href> が Phase 2-a 形式か確認
  const pagesToCheck = [
    { name: 'brand top', path: `/${TEST_BRAND_SLUG}` },
    { name: 'menu', path: `/${TEST_BRAND_SLUG}/menu` },
    { name: 'stores', path: `/${TEST_BRAND_SLUG}/stores` },
    { name: 'membership', path: `/${TEST_BRAND_SLUG}/membership` },
    { name: 'news', path: `/${TEST_BRAND_SLUG}/news` },
  ];

  for (const p of pagesToCheck) {
    test(`F-01-${p.name}: ヘッダー/フッターのリンクが Phase 2-a 形式`, async ({ page }) => {
      await page.goto(`${BASE_URL}${p.path}`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      // AidenCommon init 完了まで待つ
      await page.waitForSelector('.header, #weir-header header, header', { timeout: 10000 }).catch(() => {});

      const allHrefs = await page.$$eval('a[href]', (anchors) =>
        anchors
          .map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().substring(0, 30) }))
          .filter((a) => a.href && !/^(https?:|mailto:|tel:|javascript:|#)/.test(a.href))
      );

      // すべての href が / で始まる（絶対パス）かフラグメントのみ
      const badHrefs = allHrefs.filter((a) => {
        if (a.href.startsWith('./weir-')) return true;
        if (a.href.startsWith('./brand.html')) return true;
        return false;
      });

      expect(
        badHrefs,
        `Page ${p.name} has legacy hrefs: ${JSON.stringify(badHrefs.slice(0, 5))}`
      ).toHaveLength(0);
    });
  }
});

test.describe('Phase 2-a URL Structure — [G] Sanity: static files + middleware cache', () => {
  test('G-01: /phase2a-href-rewriter.js は直接配信される', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/phase2a-href-rewriter.js`, { timeout: PAGE_TIMEOUT });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'] || '').toMatch(/javascript|text/);
  });

  test('G-02: /weir-common.js は直接配信される', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/weir-common.js`, { timeout: PAGE_TIMEOUT });
    expect(response.status()).toBe(200);
  });

  test('G-03: ブランドページに phase2a-href-rewriter.js が含まれる', async ({ page }) => {
    await page.goto(`${BASE_URL}/${TEST_BRAND_SLUG}`, { timeout: PAGE_TIMEOUT });
    const hasRewriter = await page.evaluate(() => {
      return Array.from(document.scripts).some((s) => s.src.includes('phase2a-href-rewriter'));
    });
    expect(hasRewriter).toBeTruthy();
  });
});
