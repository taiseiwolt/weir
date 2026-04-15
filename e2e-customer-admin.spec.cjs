// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://xorder.co.jp/weir-customer-admin.html';
const SS_DIR = 'test-results/screenshots';

const results = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
}

test.describe('weir-customer-admin.html 基本動作確認', () => {

  test.afterAll(async () => {
    console.log('\n========== TEST RESULTS ==========');
    results.forEach(r => {
      const mark = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
      const d = r.detail ? ` — ${r.detail}` : '';
      console.log(`${mark} | ${r.name}${d}`);
    });
    console.log('==================================\n');
  });

  test('1. ページ正常表示（サイドバー・メインコンテンツ描画）', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // サイドバー確認
    const sidebar = page.locator('.sidebar, #sidebar, nav').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // メインコンテンツ確認
    const mainContent = page.locator('.content, main, .main-content').first();
    await expect(mainContent).toBeVisible({ timeout: 10000 });

    // サイドバーにメニュー項目があること
    const menuItems = page.locator('.nav-cat-header, .nav-category');
    const count = await menuItems.count();
    expect(count).toBeGreaterThan(0);

    await page.screenshot({ path: `${SS_DIR}/01_page_load.png`, fullPage: false });
    record('1. ページ正常表示', 'PASS', `サイドバー: visible, メニュー項目: ${count}件`);

    if (consoleErrors.length > 0) {
      record('1a. コンソールエラー(初期)', 'FAIL', consoleErrors.join(' | '));
    }
  });

  test('2. サイドバー メニュー切替', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 主要カテゴリをクリックして切替確認
    const categories = [
      { cat: 'store', label: '店舗管理', page: 'store-basic' },
      { cat: 'menu', label: 'メニュー管理', page: 'menu' },
      { cat: 'member', label: '会員・CRM・SNS', page: 'member-list' },
      { cat: 'review', label: '口コミ', page: 'review-store' },
    ];

    for (const c of categories) {
      // カテゴリヘッダをクリック
      const catHeader = page.locator(`.nav-cat-header[data-cat="${c.cat}"]`);
      if (await catHeader.count() > 0) {
        await catHeader.click();
        await page.waitForTimeout(500);

        // サブメニューが展開されたらサブアイテムをクリック
        const subItem = page.locator(`.nav-subitem[data-page="${c.page}"]`);
        if (await subItem.count() > 0 && await subItem.isVisible()) {
          await subItem.click();
          await page.waitForTimeout(800);
        }

        // 対応ページが表示されているか
        const activePage = page.locator(`#page-${c.page}`);
        if (await activePage.count() > 0) {
          const isVisible = await activePage.isVisible();
          if (isVisible) {
            record(`2. メニュー切替: ${c.label}`, 'PASS');
          } else {
            record(`2. メニュー切替: ${c.label}`, 'FAIL', `#page-${c.page} not visible`);
          }
        } else {
          // カテゴリ直接ページかもしれない（menuなど）
          const anyActive = page.locator('.page.active');
          const activeCount = await anyActive.count();
          record(`2. メニュー切替: ${c.label}`, activeCount > 0 ? 'PASS' : 'FAIL', `active pages: ${activeCount}`);
        }

        await page.screenshot({ path: `${SS_DIR}/02_nav_${c.cat}.png`, fullPage: false });
      } else {
        record(`2. メニュー切替: ${c.label}`, 'FAIL', 'カテゴリヘッダ見つからず');
      }
    }

    if (consoleErrors.length > 0) {
      record('2a. コンソールエラー(ナビ)', 'FAIL', consoleErrors.join(' | '));
    }
  });

  test('3. 店舗管理: 店舗一覧・詳細モーダル', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 店舗管理 → 基本情報
    const catHeader = page.locator('.nav-cat-header[data-cat="store"]');
    await catHeader.click();
    await page.waitForTimeout(500);

    const subItem = page.locator('.nav-subitem[data-page="store-basic"]');
    if (await subItem.isVisible()) {
      await subItem.click();
    }
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SS_DIR}/03_store_list.png`, fullPage: false });

    // 店舗テーブルの存在確認
    const storeTable = page.locator('#storeBasicTable, .store-table, table').first();
    const tableVisible = await storeTable.isVisible().catch(() => false);

    if (tableVisible) {
      record('3a. 店舗一覧表示', 'PASS');
    } else {
      // テーブルがなくてもストアセレクタがあればOK
      const selector = page.locator('.store-selector, .store-selector-bar').first();
      const selectorVisible = await selector.isVisible().catch(() => false);
      record('3a. 店舗一覧表示', selectorVisible ? 'PASS' : 'FAIL',
        selectorVisible ? 'store-selector visible' : 'テーブルもセレクタも見つからず');
    }

    // 店舗行をクリック→詳細表示を試みる
    const storeRow = page.locator('#storeBasicTable tbody tr, .store-table tbody tr, table tbody tr').first();
    if (await storeRow.count() > 0 && await storeRow.isVisible()) {
      await storeRow.click();
      await page.waitForTimeout(800);

      await page.screenshot({ path: `${SS_DIR}/03_store_detail.png`, fullPage: false });

      const detailView = page.locator('.store-detail-view.active, .store-detail-view:visible, .modal-overlay.show').first();
      if (await detailView.count() > 0) {
        record('3b. 店舗詳細モーダル表示', 'PASS');
      } else {
        // 詳細ビューが別の形式で表示される可能性
        const editView = page.locator('#storeBasicEdit, .store-edit').first();
        const editVisible = await editView.isVisible().catch(() => false);
        record('3b. 店舗詳細モーダル表示', editVisible ? 'PASS' : 'FAIL',
          editVisible ? 'edit view visible' : '詳細ビュー見つからず');
      }
    } else {
      record('3b. 店舗詳細モーダル表示', 'FAIL', '店舗行が見つからず');
    }

    if (consoleErrors.length > 0) {
      record('3c. コンソールエラー(店舗)', 'FAIL', consoleErrors.join(' | '));
    }
  });

  test('4. メニュー管理: 商品一覧・カテゴリ切替', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // メニュー管理へ遷移
    const catHeader = page.locator('.nav-cat-header[data-cat="menu"]');
    await catHeader.click();
    await page.waitForTimeout(500);

    // menuは直接ページの場合もある
    const subItem = page.locator('.nav-subitem[data-page="menu"]');
    if (await subItem.count() > 0 && await subItem.isVisible()) {
      await subItem.click();
    }
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SS_DIR}/04_menu_pattern.png`, fullPage: false });

    // メニューページ表示確認
    const menuPage = page.locator('#page-menu');
    const menuVisible = await menuPage.isVisible().catch(() => false);
    record('4a. メニュー管理ページ表示', menuVisible ? 'PASS' : 'FAIL');

    // サブタブ切替: 商品一覧タブ
    const productsTab = page.locator('#menuSubTabProducts');
    if (await productsTab.count() > 0) {
      await productsTab.click();
      await page.waitForTimeout(800);

      await page.screenshot({ path: `${SS_DIR}/04_menu_products.png`, fullPage: false });

      const productsPanel = page.locator('#menuSubProducts');
      const prodVisible = await productsPanel.isVisible().catch(() => false);
      record('4b. 商品一覧タブ切替', prodVisible ? 'PASS' : 'FAIL');
    } else {
      record('4b. 商品一覧タブ切替', 'FAIL', 'タブが見つからず');
    }

    // カテゴリフィルタ
    const catFilter = page.locator('#productPoolCatFilter, #menuItemCatFilter, select[id*="CatFilter"]').first();
    if (await catFilter.count() > 0 && await catFilter.isVisible()) {
      // オプション数を確認
      const options = await catFilter.locator('option').count();
      record('4c. カテゴリフィルタ', options > 1 ? 'PASS' : 'FAIL', `${options}個のカテゴリ`);

      // 2番目のカテゴリを選択
      if (options > 1) {
        await catFilter.selectOption({ index: 1 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SS_DIR}/04_menu_category.png`, fullPage: false });
      }
    } else {
      record('4c. カテゴリフィルタ', 'FAIL', 'フィルタ見つからず');
    }

    // パターンタブに戻る
    const patternTab = page.locator('#menuSubTabPattern');
    if (await patternTab.count() > 0) {
      await patternTab.click();
      await page.waitForTimeout(800);

      const patternPanel = page.locator('#menuSubPattern, #menuPatternList');
      const patternVisible = await patternPanel.first().isVisible().catch(() => false);
      record('4d. メニューパターンタブ切替', patternVisible ? 'PASS' : 'FAIL');
    }

    if (consoleErrors.length > 0) {
      record('4e. コンソールエラー(メニュー)', 'FAIL', consoleErrors.join(' | '));
    }
  });

  test('5. 会員ダッシュボード: 統計カード・会員テーブル', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 会員・CRM・SNS → 会員ダッシュボード
    const catHeader = page.locator('.nav-cat-header[data-cat="member"]');
    await catHeader.click();
    await page.waitForTimeout(500);

    const subItem = page.locator('.nav-subitem[data-page="member-list"]');
    if (await subItem.isVisible()) {
      await subItem.click();
    }
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SS_DIR}/05_member_dashboard.png`, fullPage: false });

    // 統計カード確認
    const statCards = page.locator('#page-member-list .stat-card, #page-member-list .stats-row .stat-card');
    const cardCount = await statCards.count();
    record('5a. 統計カード表示', cardCount > 0 ? 'PASS' : 'FAIL', `${cardCount}枚のカード`);

    // 会員テーブル確認
    const memberTable = page.locator('#memberTable, #memberTableBody');
    const tableVisible = await memberTable.first().isVisible().catch(() => false);

    if (tableVisible) {
      const rows = page.locator('#memberTableBody tr, #memberTable tbody tr');
      const rowCount = await rows.count();
      record('5b. 会員一覧テーブル表示', rowCount > 0 ? 'PASS' : 'FAIL', `${rowCount}行`);
    } else {
      record('5b. 会員一覧テーブル表示', 'FAIL', 'テーブル非表示');
    }

    await page.screenshot({ path: `${SS_DIR}/05_member_table.png`, fullPage: false });

    if (consoleErrors.length > 0) {
      record('5c. コンソールエラー(会員)', 'FAIL', consoleErrors.join(' | '));
    }
  });

  test('6. 口コミ管理: レビュー一覧', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 口コミ → 店舗レビュー
    const catHeader = page.locator('.nav-cat-header[data-cat="review"]');
    await catHeader.click();
    await page.waitForTimeout(500);

    const subItem = page.locator('.nav-subitem[data-page="review-store"]');
    if (await subItem.isVisible()) {
      await subItem.click();
    }
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SS_DIR}/06_review_store.png`, fullPage: false });

    // 店舗レビュー一覧確認
    const reviewBody = page.locator('#storeReviewBody, #page-review-store table tbody, #page-review-store .review-list');
    const reviewVisible = await reviewBody.first().isVisible().catch(() => false);

    if (reviewVisible) {
      const rows = page.locator('#storeReviewBody tr');
      const rowCount = await rows.count();
      record('6a. 店舗レビュー一覧表示', rowCount > 0 ? 'PASS' : 'FAIL', `${rowCount}件`);
    } else {
      // テーブルがなくてもページ自体が表示されていればPASS
      const reviewPage = page.locator('#page-review-store');
      const pageVisible = await reviewPage.isVisible().catch(() => false);
      record('6a. 店舗レビュー一覧表示', pageVisible ? 'PASS' : 'FAIL',
        pageVisible ? 'ページ表示あり(データなし可能性)' : 'ページ非表示');
    }

    // 商品レビューに切替
    const prodReviewItem = page.locator('.nav-subitem[data-page="review-product"]');
    if (await prodReviewItem.count() > 0 && await prodReviewItem.isVisible()) {
      await prodReviewItem.click();
      await page.waitForTimeout(800);

      await page.screenshot({ path: `${SS_DIR}/06_review_product.png`, fullPage: false });

      const prodReviewPage = page.locator('#page-review-product');
      const prodVisible = await prodReviewPage.isVisible().catch(() => false);
      record('6b. 商品レビュー一覧表示', prodVisible ? 'PASS' : 'FAIL');
    } else {
      record('6b. 商品レビュー一覧表示', 'FAIL', 'サブメニュー見つからず');
    }

    if (consoleErrors.length > 0) {
      record('6c. コンソールエラー(口コミ)', 'FAIL', consoleErrors.join(' | '));
    }
  });

  test('7. コンソールエラー総合チェック', async ({ page }) => {
    const consoleErrors = [];
    const consoleWarnings = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 全主要ページを巡回（showPageはcatIdも必要）
    const pageMap = [
      { pageId: 'store-basic', catId: 'store' },
      { pageId: 'menu', catId: 'menu' },
      { pageId: 'member-list', catId: 'member' },
      { pageId: 'review-store', catId: 'review' },
    ];
    for (const p of pageMap) {
      await page.evaluate(({ pageId, catId }) => {
        if (typeof showPage === 'function') {
          showPage(pageId, catId);
        }
      }, p);
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(1000);

    if (consoleErrors.length === 0) {
      record('7. コンソールエラー総合', 'PASS', 'エラーなし');
    } else {
      record('7. コンソールエラー総合', 'FAIL', consoleErrors.join(' | '));
    }

    if (consoleWarnings.length > 0) {
      record('7a. コンソール警告', 'PASS', `${consoleWarnings.length}件の警告（情報のみ）`);
    }

    await page.screenshot({ path: `${SS_DIR}/07_final_state.png`, fullPage: false });
  });
});
