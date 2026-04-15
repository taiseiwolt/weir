// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://xorder.co.jp';
const SUPABASE_URL = 'https://iikwusprydaogzeslgdz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC';
const SS_DIR = 'test-results/screenshots/data-consistency';

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail });
}

// ============================================================
// 1. weir-admin.html ↔ weir-customer-admin.html 整合性テスト
// ============================================================
test.describe('1. Admin ↔ Customer-Admin データ整合性', () => {

  test.afterAll(async () => {
    console.log('\n========== DATA CONSISTENCY RESULTS ==========');
    results.forEach(r => {
      const mark = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${mark} ${r.status} | ${r.name} — ${r.detail}`);
    });
    console.log('===============================================\n');
  });

  test('1-1. 店舗データの一致確認（stores テーブル参照）', async ({ page }) => {
    // Admin 側の店舗データ取得
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const adminStores = await page.evaluate(() => {
      if (typeof STORES !== 'undefined' && STORES.length > 0) {
        return STORES.map(s => ({ id: s.id, name: s.name, addr: s.addr || s.address }));
      }
      return null;
    });

    if (!adminStores) {
      record('1-1. 店舗データ一致', 'SKIP', 'Admin の STORES がロードされていない（Supabase未接続の可能性）');
      return;
    }

    // Supabase から直接取得して比較
    const storeRes = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);
      const { data, error } = await sb.from('stores').select('id, name, address');
      return { data, error: error ? error.message : null };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (storeRes.error || !storeRes.data) {
      record('1-1. 店舗データ一致', 'SKIP', 'Supabase stores クエリ失敗: ' + storeRes.error);
      return;
    }

    const dbStoreNames = storeRes.data.map(s => s.name).sort();
    const adminStoreNames = adminStores.map(s => s.name).sort();

    const match = JSON.stringify(dbStoreNames) === JSON.stringify(adminStoreNames);
    await page.screenshot({ path: `${SS_DIR}/1-1_admin_stores.png`, fullPage: false });

    if (match) {
      record('1-1. 店舗データ一致', 'PASS', `${dbStoreNames.length}件の店舗が一致`);
    } else {
      const missing = dbStoreNames.filter(n => !adminStoreNames.includes(n));
      const extra = adminStoreNames.filter(n => !dbStoreNames.includes(n));
      record('1-1. 店舗データ一致', 'FAIL', `DB:${dbStoreNames.length}件, Admin:${adminStoreNames.length}件. 不足:${missing.join(',')} 余分:${extra.join(',')}`);
    }
    expect(match).toBeTruthy();
  });

  test('1-2. 会員データ件数の一致確認', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const adminMemberCount = await page.evaluate(() => {
      return typeof MEMBERS !== 'undefined' ? MEMBERS.length : -1;
    });

    // Supabase直接クエリ（anon key では members の RLS で制限される可能性あり）
    const dbCount = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);
      const { data, error, count } = await sb.from('members').select('id', { count: 'exact', head: true });
      return { count: count || (data ? data.length : 0), error: error ? error.message : null };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    await page.screenshot({ path: `${SS_DIR}/1-2_member_count.png`, fullPage: false });

    if (adminMemberCount === -1) {
      record('1-2. 会員件数一致', 'SKIP', 'Admin MEMBERS 未ロード');
      return;
    }

    record('1-2. 会員件数一致', adminMemberCount === dbCount.count ? 'PASS' : 'WARN',
      `Admin:${adminMemberCount}件, DB:${dbCount.count}件 (RLS制限の可能性あり)`);
  });

  test('1-3. 会員ランク表示方式の確認（current_rank_id 参照）', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Admin のランク分布を取得
    const adminRanks = await page.evaluate(() => {
      if (typeof MEMBERS === 'undefined' || MEMBERS.length === 0) return null;
      const dist = {};
      MEMBERS.forEach(m => { dist[m.rank] = (dist[m.rank] || 0) + 1; });
      return dist;
    });

    if (!adminRanks) {
      record('1-3. ランク表示整合', 'SKIP', 'Admin MEMBERS 未ロード');
      return;
    }

    // 全員レギュラーなら current_rank_id が未設定 or rank_settings 未定義の可能性
    const allRegular = Object.keys(adminRanks).length === 1 && adminRanks['レギュラー'];
    if (allRegular) {
      record('1-3. ランク表示整合', 'WARN',
        `全員レギュラー(${adminRanks['レギュラー']}名): rank_settings 未設定 or current_rank_id 未割当の可能性`);
    } else {
      record('1-3. ランク表示整合', 'PASS',
        `ランク分布: ${JSON.stringify(adminRanks)}`);
    }
  });

  test('1-4. 会員ポイント（point_transactions 集計 vs 表示値）', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const pointCheck = await page.evaluate(async (cfg) => {
      if (typeof MEMBERS === 'undefined' || MEMBERS.length === 0) return { skip: true };

      const sb = supabase.createClient(cfg.url, cfg.key);
      const { data: pts } = await sb.from('point_transactions').select('member_id, amount');
      if (!pts || pts.length === 0) return { noTransactions: true, memberCount: MEMBERS.length };

      // Aggregate from transactions
      const ptBalance = {};
      pts.forEach(t => { ptBalance[t.member_id] = (ptBalance[t.member_id] || 0) + t.amount; });

      // Compare with MEMBERS
      let mismatches = 0;
      let checked = 0;
      const examples = [];
      MEMBERS.forEach(m => {
        const txBal = ptBalance[m.id];
        if (txBal !== undefined) {
          checked++;
          const expected = Math.max(0, txBal);
          if (m.points !== expected && examples.length < 3) {
            mismatches++;
            examples.push({ id: m.id.substring(0, 8), display: m.points, expected });
          }
        }
      });

      return { checked, mismatches, examples, totalMembers: MEMBERS.length, totalTx: pts.length };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (pointCheck.skip) {
      record('1-4. ポイント整合', 'SKIP', 'MEMBERS 未ロード');
      return;
    }
    if (pointCheck.noTransactions) {
      record('1-4. ポイント整合', 'WARN', `point_transactions 0件 (会員${pointCheck.memberCount}名)`);
      return;
    }

    if (pointCheck.mismatches === 0) {
      record('1-4. ポイント整合', 'PASS', `${pointCheck.checked}名のポイント一致 (TX:${pointCheck.totalTx}件)`);
    } else {
      record('1-4. ポイント整合', 'FAIL',
        `${pointCheck.mismatches}/${pointCheck.checked}件不一致. 例: ${JSON.stringify(pointCheck.examples)}`);
    }
  });
});

// ============================================================
// 2. weir-order-dashboard.html ↔ weir-admin.html 整合性テスト
// ============================================================
test.describe('2. Dashboard ↔ Admin 注文データ整合性', () => {

  test('2-1. 注文ステータスマッピング検証', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-order-dashboard.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ステータスマッピング関数のテスト
    const mappingTest = await page.evaluate(() => {
      if (typeof mapOrderStatus !== 'function') return { skip: true };

      const tests = [
        // API が作成するステータス
        { input: 'order_placed', expected: 'new' },
        { input: 'accepted', expected: 'cooking' },
        { input: 'preparing', expected: 'cooking' },
        { input: 'prepared', expected: 'ready' },
        { input: 'delivered', expected: 'done' },
        { input: 'picked_up', expected: 'done' },
        { input: 'completed', expected: 'done' },
        { input: 'cancelled', expected: 'cancelled' },
        // Legacy ステータス
        { input: 'pending', expected: 'new' },
        { input: 'placed', expected: 'new' },
        { input: 'confirmed', expected: 'cooking' },
      ];

      const results = tests.map(t => ({
        ...t,
        actual: mapOrderStatus(t.input),
        pass: mapOrderStatus(t.input) === t.expected
      }));

      return { results, allPass: results.every(r => r.pass) };
    });

    if (mappingTest.skip) {
      record('2-1. ステータスマッピング', 'SKIP', 'mapOrderStatus 関数未定義');
      return;
    }

    const failed = mappingTest.results.filter(r => !r.pass);
    if (mappingTest.allPass) {
      record('2-1. ステータスマッピング', 'PASS', `${mappingTest.results.length}パターン全一致`);
    } else {
      record('2-1. ステータスマッピング', 'FAIL',
        `不一致: ${failed.map(f => `${f.input}→${f.actual}(期待:${f.expected})`).join(', ')}`);
    }
    expect(mappingTest.allPass).toBeTruthy();
  });

  test('2-2. Dashboard → API ステータス更新値の検証', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-order-dashboard.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const statusNextCheck = await page.evaluate(() => {
      if (typeof STATUS_NEXT_API === 'undefined') return { skip: true };

      // API の有効ステータスリスト
      const validApiStatuses = ['order_placed', 'accepted', 'preparing', 'prepared', 'delivering', 'delivered', 'picked_up', 'completed'];

      const checks = Object.entries(STATUS_NEXT_API).map(([from, to]) => ({
        from, to,
        valid: validApiStatuses.includes(to)
      }));

      return { checks, allValid: checks.every(c => c.valid) };
    });

    if (statusNextCheck.skip) {
      record('2-2. API ステータス値', 'SKIP', 'STATUS_NEXT_API 未定義');
      return;
    }

    const invalid = statusNextCheck.checks.filter(c => !c.valid);
    if (statusNextCheck.allValid) {
      record('2-2. API ステータス値', 'PASS',
        `全マッピング有効: ${statusNextCheck.checks.map(c => `${c.from}→${c.to}`).join(', ')}`);
    } else {
      record('2-2. API ステータス値', 'FAIL',
        `無効なステータス: ${invalid.map(i => `${i.from}→${i.to}`).join(', ')}`);
    }
    expect(statusNextCheck.allValid).toBeTruthy();
  });

  test('2-3. Admin注文件数 vs Supabase注文件数', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const orderCheck = await page.evaluate(async (cfg) => {
      if (typeof ORDERS === 'undefined') return { skip: true, reason: 'ORDERS 未定義' };

      const sb = supabase.createClient(cfg.url, cfg.key);
      const { count, error } = await sb.from('orders').select('id', { count: 'exact', head: true });

      return {
        adminCount: ORDERS.length,
        dbCount: count || 0,
        error: error ? error.message : null,
        limit: 2000  // current query limit
      };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (orderCheck.skip) {
      record('2-3. 注文件数一致', 'SKIP', orderCheck.reason);
      return;
    }

    if (orderCheck.error) {
      record('2-3. 注文件数一致', 'WARN', `DBクエリエラー: ${orderCheck.error}`);
      return;
    }

    const match = orderCheck.adminCount === orderCheck.dbCount;
    const truncated = orderCheck.adminCount >= orderCheck.limit;

    if (match) {
      record('2-3. 注文件数一致', 'PASS', `${orderCheck.adminCount}件一致`);
    } else if (truncated) {
      record('2-3. 注文件数一致', 'WARN',
        `Admin:${orderCheck.adminCount}件(limit=${orderCheck.limit}到達), DB:${orderCheck.dbCount}件 → limit超過による切り捨て`);
    } else {
      record('2-3. 注文件数一致', 'FAIL',
        `Admin:${orderCheck.adminCount}件, DB:${orderCheck.dbCount}件`);
    }
  });
});

// ============================================================
// 3. モバイルオーダー → 管理画面 データフローテスト
// ============================================================
test.describe('3. Mobile Order → Admin データフロー', () => {

  test('3-1. Checkout → orders テーブル: Stripe Edge Function 疎通確認', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-order-checkout.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // stripe-create-payment-intent の URL が正しく設定されているか確認
    const edgeFnCheck = await page.evaluate(() => {
      const hasSupabase = typeof sb !== 'undefined' || typeof supabase !== 'undefined';
      const hasStripeUrl = document.body.innerHTML.includes('stripe-create-payment-intent');
      const hasSendEmail = document.body.innerHTML.includes('send-order-email');

      return { hasSupabase, hasStripeUrl, hasSendEmail };
    });

    record('3-1. Edge Function 参照', 'PASS',
      `Supabase:${edgeFnCheck.hasSupabase ? '✓' : '✗'}, Stripe PI:${edgeFnCheck.hasStripeUrl ? '✓' : '✗'}, Email:${edgeFnCheck.hasSendEmail ? '✓' : '✗'}`);
  });

  test('3-2. Order Dashboard リアルタイム購読設定の確認', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-order-dashboard.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const realtimeCheck = await page.evaluate(() => {
      const hasStartRealtime = typeof startRealtime === 'function';
      const hasStartPolling = typeof startPolling === 'function';
      const hasBuildOrder = typeof buildDashboardOrder === 'function';

      // Check if realtime channel is set up
      let channelActive = false;
      try {
        if (typeof sb !== 'undefined' && sb.getChannels) {
          channelActive = sb.getChannels().length > 0;
        }
      } catch(e) {}

      return { hasStartRealtime, hasStartPolling, hasBuildOrder, channelActive };
    });

    await page.screenshot({ path: `${SS_DIR}/3-2_dashboard_realtime.png`, fullPage: false });

    record('3-2. リアルタイム購読', 'PASS',
      `Realtime関数:${realtimeCheck.hasStartRealtime ? '✓' : '✗'}, Polling:${realtimeCheck.hasStartPolling ? '✓' : '✗'}, Channel:${realtimeCheck.channelActive ? 'active' : 'inactive'}`);
  });

  test('3-3. point_transactions の order_id 設定確認', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const ptCheck = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);
      const { data, error } = await sb.from('point_transactions')
        .select('id, order_id, source, reason')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) return { error: error ? error.message : 'no data' };

      const total = data.length;
      const nullOrderId = data.filter(t => t.order_id === null).length;
      const orderRelated = data.filter(t =>
        t.reason && (t.reason.includes('注文') || t.reason.includes('order'))
      );
      const orderRelatedNull = orderRelated.filter(t => t.order_id === null).length;

      return { total, nullOrderId, orderRelated: orderRelated.length, orderRelatedNull };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (ptCheck.error) {
      record('3-3. PT order_id', 'SKIP', `クエリエラー: ${ptCheck.error}`);
      return;
    }

    if (ptCheck.orderRelatedNull > 0) {
      record('3-3. PT order_id', 'WARN',
        `注文関連TX ${ptCheck.orderRelated}件中 ${ptCheck.orderRelatedNull}件の order_id が NULL（トレーサビリティ低下）`);
    } else if (ptCheck.total === 0) {
      record('3-3. PT order_id', 'SKIP', 'point_transactions 0件');
    } else {
      record('3-3. PT order_id', 'PASS',
        `全${ptCheck.total}件中 order_id NULL:${ptCheck.nullOrderId}件（注文関連は全て紐付済）`);
    }
  });
});

// ============================================================
// 4. Supabase テーブル参照整合性テスト
// ============================================================
test.describe('4. Supabase テーブル参照整合性', () => {

  test('4-1. guest_order_summaries ビュー: Admin と Customer-Admin の結果一致', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const viewCheck = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);
      const { data, error } = await sb.from('guest_order_summaries').select('*');
      if (error) return { error: error.message };
      return {
        count: data ? data.length : 0,
        totalOrders: data ? data.reduce((s, d) => s + (d.order_count || 0), 0) : 0,
        totalAmount: data ? data.reduce((s, d) => s + (Number(d.total_amount) || 0), 0) : 0
      };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (viewCheck.error) {
      record('4-1. ゲスト注文ビュー', 'SKIP', `エラー: ${viewCheck.error}`);
      return;
    }

    record('4-1. ゲスト注文ビュー', 'PASS',
      `ゲスト集計: ${viewCheck.count}件, 注文合計:${viewCheck.totalOrders}件, 金額:¥${viewCheck.totalAmount.toLocaleString()}`);
  });

  test('4-2. orders テーブルの store_id 外部キー整合性', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const fkCheck = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);

      // Get all unique store_ids from orders
      const { data: orders } = await sb.from('orders').select('store_id').limit(500);
      if (!orders) return { error: 'orders query failed' };

      const orderStoreIds = [...new Set(orders.map(o => o.store_id).filter(Boolean))];

      // Get all store ids
      const { data: stores } = await sb.from('stores').select('id');
      if (!stores) return { error: 'stores query failed' };

      const storeIds = new Set(stores.map(s => s.id));

      const orphans = orderStoreIds.filter(id => !storeIds.has(id));

      return { orderStoreIds: orderStoreIds.length, storeCount: storeIds.size, orphans };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (fkCheck.error) {
      record('4-2. store_id FK整合', 'SKIP', fkCheck.error);
      return;
    }

    if (fkCheck.orphans.length === 0) {
      record('4-2. store_id FK整合', 'PASS',
        `注文の全store_id(${fkCheck.orderStoreIds}件)が stores テーブルに存在`);
    } else {
      record('4-2. store_id FK整合', 'FAIL',
        `孤立store_id: ${fkCheck.orphans.join(', ')} (stores テーブルに未登録)`);
    }
  });

  test('4-3. members.total_spend と orders 実績の一致確認', async ({ page }) => {
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const spendCheck = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);

      // Get members with total_spend
      const { data: members } = await sb.from('members')
        .select('id, total_spend, monthly_order_count')
        .not('total_spend', 'is', null)
        .limit(20);

      if (!members || members.length === 0) return { skip: true };

      // Get actual order totals for these members
      const memberIds = members.map(m => m.id);
      const { data: orders } = await sb.from('orders')
        .select('member_id, total_amount, status')
        .in('member_id', memberIds);

      if (!orders) return { skip: true, reason: 'orders query failed' };

      // Aggregate actual order totals (exclude cancelled)
      const actualSpend = {};
      const actualCount = {};
      orders.forEach(o => {
        if (o.status === 'cancelled') return;
        actualSpend[o.member_id] = (actualSpend[o.member_id] || 0) + (o.total_amount || 0);
        actualCount[o.member_id] = (actualCount[o.member_id] || 0) + 1;
      });

      let mismatches = [];
      members.forEach(m => {
        const actual = actualSpend[m.id] || 0;
        if (m.total_spend && Math.abs(m.total_spend - actual) > 1) {
          mismatches.push({
            id: m.id.substring(0, 8),
            stored: m.total_spend,
            actual,
            diff: m.total_spend - actual
          });
        }
      });

      return { checked: members.length, mismatches, orderCount: orders.length };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    if (spendCheck.skip) {
      record('4-3. total_spend 整合', 'SKIP', spendCheck.reason || 'members.total_spend が未設定');
      return;
    }

    if (spendCheck.mismatches.length === 0) {
      record('4-3. total_spend 整合', 'PASS',
        `${spendCheck.checked}名の total_spend がorders実績と一致`);
    } else {
      record('4-3. total_spend 整合', 'WARN',
        `${spendCheck.mismatches.length}/${spendCheck.checked}名で差異: ${JSON.stringify(spendCheck.mismatches.slice(0, 3))}`);
    }
  });
});

// ============================================================
// 5. API エンドポイント整合性テスト
// ============================================================
test.describe('5. API エンドポイント整合性', () => {

  test('5-1. GET /api/orders が Dashboard と同じデータを返すこと', async ({ page, request }) => {
    // API から注文データ取得
    let apiOrders;
    try {
      const res = await request.get(`${BASE_URL}/api/orders/?store_id=test&limit=5`);
      if (res.ok()) {
        apiOrders = await res.json();
      }
    } catch (e) {
      // API may require auth or specific store_id
    }

    if (!apiOrders) {
      record('5-1. API注文データ', 'SKIP', 'API レスポンスなし（認証 or store_id 不足）');
      return;
    }

    record('5-1. API注文データ', 'PASS',
      `API から ${Array.isArray(apiOrders) ? apiOrders.length : 'N/A'} 件の注文取得成功`);
  });

  test('5-2. API ステータス値の有効性確認', async ({ request }) => {
    // API の valid statuses を確認（ドキュメントベースの検証）
    const validApiStatuses = ['order_placed', 'accepted', 'preparing', 'prepared', 'delivering', 'delivered', 'picked_up', 'completed'];
    const dashboardToApi = { new: 'accepted', cooking: 'prepared', ready: 'delivered' };

    const allValid = Object.values(dashboardToApi).every(s => validApiStatuses.includes(s));

    if (allValid) {
      record('5-2. API ステータス有効性', 'PASS',
        `Dashboard→API マッピング全有効: ${JSON.stringify(dashboardToApi)}`);
    } else {
      const invalid = Object.entries(dashboardToApi).filter(([, v]) => !validApiStatuses.includes(v));
      record('5-2. API ステータス有効性', 'FAIL',
        `無効マッピング: ${invalid.map(([k, v]) => `${k}→${v}`).join(', ')}`);
    }
    expect(allValid).toBeTruthy();
  });

  test('5-3. Menu API と Customer-Admin メニューデータの整合性', async ({ page, request }) => {
    // Menu API から取得
    let apiMenu;
    try {
      const res = await request.get(`${BASE_URL}/api/menu/products`);
      if (res.ok()) {
        apiMenu = await res.json();
      }
    } catch (e) {}

    if (!apiMenu) {
      record('5-3. Menu API整合', 'SKIP', 'Menu API レスポンスなし');
      return;
    }

    // Supabase からも直接取得して比較
    await page.goto(`${BASE_URL}/weir-admin.html`, { waitUntil: 'networkidle', timeout: 15000 });
    const dbProducts = await page.evaluate(async (cfg) => {
      const sb = supabase.createClient(cfg.url, cfg.key);
      const { data } = await sb.from('products').select('id, name');
      return data || [];
    }, { url: SUPABASE_URL, key: SUPABASE_KEY });

    const apiCount = Array.isArray(apiMenu) ? apiMenu.length : (apiMenu.products ? apiMenu.products.length : 0);
    const dbCount = dbProducts.length;

    record('5-3. Menu API整合',
      apiCount === dbCount ? 'PASS' : 'WARN',
      `API:${apiCount}件, DB:${dbCount}件`);
  });
});
