# aiden-admin.html「注文管理」セクション実装計画（ULTRAPLAN）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aiden-admin.html にプラットフォーム全体の注文を横断的に閲覧・操作できる「注文管理」ページを新規追加する。

**Architecture:** 既存の `renderPage()` ディスパッチパターンに `orders` ケースを1つ追加するのみ。追加関数（`renderOrdersPage()` / `initOrdersPage()` / `loadOrders()` / `advanceOrderStatus()` / `cancelOrder()` / `openOrderDetailModal()` / `startOrdersRealtime()` / `stopOrdersRealtime()`）は既存の命名規則・エスケープ規則・モーダル規則に従う。グローバル `MERCHANTS` / `BRANDS` / `VENUES` は既に読み込み済みのため、法人→ブランド→店舗カスケードはクライアント側フィルタだけで完結する。DBクエリは `venue_id` / `merchant_id`（リネーム後の新カラム）で直接叩く。

**Tech Stack:** Pure HTML/Vanilla JS, Supabase JS Client v2, 既存の `sb`（Supabase クライアント）/ `escHtml` / `showToast` / `openModal` / `closeModal` / `logAudit` / `statusBadge` ヘルパ群。

---

## 事前調査サマリ（CC済み・2026-04-10）

### 1. aiden-admin.html 既存構造
- **サイドバー**: 86〜99行目、`<div class="nav-item" data-page="…" onclick="goTo('…')">` パターン
- **ページ切替**: `goTo(p)` → `currentView.type=p` → `updateSidebar()` → `renderPage()`
- **updateSidebar() の sidebarPage マップ**: 429行目に `{dashboard:'dashboard', corps:'corps', …, bulk:'bulk', corp:'corps', brand:'brands', store:'stores'}` という対応表。**`orders:'orders'` を追加する必要あり**
- **renderPage()**: 454〜477行目、`if/else if` で各ページを `content` 要素に `innerHTML` する
- **既存ヘルパ**:
  - `escHtml(s)` – XSSエスケープ（142行目）
  - `showToast(msg)` – トースト表示（143行目）
  - `openModal(h, wide)` / `closeModal()` – モーダル開閉（147〜148行目）
  - `statusBadge(s)` – ステータスバッジHTML（139行目）
  - `logAudit(action, targetTable, targetId, details)` – 監査ログ記録（266行目）
  - `getMerchantForBrand / getBrandsForMerchant / getVenuesForBrand / getVenuesForMerchant / getBrandForVenue / getMerchantForVenue`（151〜156行目）
- **グローバル**: `MERCHANTS[] / BRANDS[] / VENUES[] / CBR[]`（loadAllData で起動時に読み込み済み）
  - `MERCHANTS[i]` = `{_uuid, id(display_id), name, ...}`
  - `BRANDS[i]` = `{_uuid, id(display_id), corpId, name, ...}`
  - `VENUES[i]` = `{_uuid, id(display_id), brandId, name, corpUuid, corpId, ...}`
- **Supabase クライアント**: `const sb=supabase.createClient(...)` （161行目）
- **モーダルESC閉じ**: 既にグローバルに設定済み（150行目）ので追加実装不要

### 2. orders テーブル主要カラム（sql/, migrations/ から逆引き）
| カラム | 型 | 用途 |
|---|---|---|
| id | UUID PK | |
| display_id | TEXT | 注文ID（表示用）|
| venue_id | UUID | 店舗FK（旧 store_id、2026-04-10 リネーム後） |
| brand_id | UUID | ブランドFK |
| merchant_id | UUID | 法人FK（旧 corp_id/corporation_id、リネーム後） |
| order_type | TEXT | dinein / takeout / delivery |
| status | TEXT | 旧ステータス列（legacy、参照のみ）|
| tracking_status | TEXT | placed / cooking / ready / completed / cancelled / delivered / picked_up |
| payment_status | TEXT | pending / authorized / captured / failed / refunded / disputed 等 |
| payment_intent_id | TEXT | Stripe PaymentIntent ID |
| total_amount | INTEGER | 合計金額 |
| delivery_fee | INTEGER | 配達料 |
| service_fee | INTEGER | サービス料 |
| surcharge_amount | INTEGER | 少額注文手数料 |
| channel | TEXT | 注文チャネル |
| notes | TEXT | 備考 |
| pickup_at | TIMESTAMPTZ | 受け渡し日時 |
| created_at / updated_at | TIMESTAMPTZ | |
| customer_name / customer_email / customer_phone | TEXT | 顧客連絡先（PII） |
| member_id | UUID | 会員FK（NULL=ゲスト注文） |

### 3. order_items テーブル主要カラム
| カラム | 用途 |
|---|---|
| id | UUID PK |
| order_id | UUID FK |
| product_id | UUID FK |
| size_id | UUID FK |
| quantity | INTEGER |
| unit_price | INTEGER |
| subtotal | INTEGER |
| product_name | TEXT（snapshot、NULL可。NULL時は products.name にフォールバック） |

### 4. audit_logs テーブル（既存 `logAudit()` 互換カラム）
- `user_email / action / target_table / target_id / details`（レガシー列、`logAudit()` がそのまま利用）
- 既存パターンと同じく `logAudit()` をそのまま呼ぶだけでよい

### 5. Realtime パターン（aiden-order-dashboard.html 1200〜1265 行参照）
```js
realtimeChannel = sb.channel('<channel-name>')
  .on('postgres_changes', {event:'INSERT', schema:'public', table:'orders'}, handler)
  .on('postgres_changes', {event:'UPDATE', schema:'public', table:'orders'}, handler)
  .subscribe();
// クリーンアップ:
sb.removeChannel(realtimeChannel); realtimeChannel=null;
```

---

## ⚠️ 事前確認が必要な未決事項（Taisei確認待ち）

1. **ゲストPIIの表示方針**
   CLAUDE.md の「ゲストPII非共有」ルールは「事業者に見せない」意味で、platform_admin（AIden社内）は見てよい前提のはず。依頼書には `customer_name / customer_phone / customer_email` を詳細モーダルに表示すると明記されている。
   → **平台管理者はPIIを閲覧可能と解釈して実装してよいか？**

2. **ステータスフィルタの網羅性**
   依頼書は `全て / placed / cooking / ready / completed / cancelled` の6択。しかしDB上は `delivered`（配達完了）/ `picked_up`（テイクアウト受取済み）も存在しうる。
   → **案A: `delivered` / `picked_up` も filter に追加する**
   → **案B: `completed` に全て集約する（表示時に変換・フィルタ時は `.in('tracking_status', ['completed','delivered','picked_up'])`）**
   → どちらで実装しますか？（本計画ではデフォルトで **案B** を採用して記述。全てを `completed` として扱い、詳細モーダルでは元の値をそのまま表示）

3. **サイドバーアイコンの重複**
   依頼書の指定通り 📋 を使うと、98行目の「操作ログ（auditlog）」と重複する。
   → **案A: 依頼書どおり 📋（重複許容）** ←デフォルト
   → **案B: 別アイコンに変更（例: 🛒 / 📦 / 📮）**

4. **「顧客名」カラムの表示ルール**
   - 会員注文: `members` テーブルとJOINして氏名取得（まだ未実装）
   - ゲスト注文: `orders.customer_name` をそのまま表示
   → **会員注文の場合も `customer_name` がDBに保存されていれば `customer_name` を優先使用、NULLなら `members.name` にフォールバック、という方針でよいか？**
   → 本計画ではデフォルトで「`orders.customer_name` → `members.display_name` → `—`」の優先順で実装。

5. **Stripe 与信キャンセル案内の提示方法**
   依頼書: 「キャンセル時に…メッセージをモーダルで表示すること」
   → `confirm()` → 更新成功 → その後 `openModal()` で案内表示、という2ステップで実装します。

---

## File Structure

- Modify: `/Users/taisei/Desktop/aiden-demo/aiden-admin.html`（唯一の変更対象）
  - サイドバー（91行目の後）に nav-item 追加（+1行）
  - 429行目の `sidebarPage` マップに `orders:'orders'` 追加
  - 454〜477行目の `renderPage()` に `orders` 分岐追加（+1行）
  - JS末尾の適切な場所に新規関数群を追加（約 300〜400 行）
  - 既存の `goTo()` 呼び出し箇所（458 か所以上）を活かし、ページ遷移時の realtime クリーンアップを `renderPage()` 冒頭 or `goTo()` で行う

既存コードに新規関数を **追記するだけ** で、既存ロジックは変更しない。

---

## Task 1: 事前 SELECT 検証（本番DBスキーマ確認）

**Files:**
- Read only: Supabase `orders / order_items / audit_logs` スキーマ

- [ ] **Step 1: 本番 information_schema で orders の全カラムを確認**

Supabase SQL Editor で以下を実行し、上記「2. orders テーブル主要カラム」表と突合:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
ORDER BY ordinal_position;
```

- **期待**: `venue_id / brand_id / merchant_id / tracking_status / payment_status / pickup_at / customer_name / customer_email / customer_phone` がすべて存在。
- もし `store_id` / `corp_id` がまだ残っていた場合は、リネーム未適用としてTaiseiへ報告し中断。

- [ ] **Step 2: order_items カラム確認**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='order_items'
ORDER BY ordinal_position;
```

- **期待**: `id / order_id / product_id / size_id / quantity / unit_price / subtotal / product_name`。
- `product_name` が NULL 許容（snapshot 列）であることを確認。

- [ ] **Step 3: audit_logs カラム確認（INSERT 互換性）**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='audit_logs'
ORDER BY ordinal_position;
```

- **期待**: `user_email / action / target_table / target_id / details` が存在し、既存 `logAudit()` がそのまま動くこと。

- [ ] **Step 4: tracking_status の実在値を抜き出す**

```sql
SELECT tracking_status, COUNT(*)
FROM orders
GROUP BY tracking_status
ORDER BY 2 DESC;
```

- 本番にどの値が実在するか確認し、フィルタの値を最終確定する（未決事項2 の Taisei回答と合わせる）。

- [ ] **Step 5: 結果を Taisei に共有し、未決事項1〜5の回答を待つ**

---

## Task 2: サイドバー + 経路配線

**Files:**
- Modify: `aiden-admin.html:91`（新規 nav-item 追加）
- Modify: `aiden-admin.html:429`（sidebarPage マップ）
- Modify: `aiden-admin.html:454-477`（renderPage 分岐）

- [ ] **Step 1: サイドバーに nav-item を追加**

91行目（users）の直後、92行目（system）の前に以下を挿入:

```html
  <div class="nav-item" data-page="orders" onclick="goTo('orders')"><span class="icon">📋</span><span class="label">注文管理</span></div>
```

- [ ] **Step 2: updateSidebar() の sidebarPage マップを拡張**

429行目を以下に変更（`orders:'orders'` を追加）:

```js
  const sidebarPage={dashboard:'dashboard',corps:'corps',brands:'brands',stores:'stores',menus:'menus',users:'users',orders:'orders',system:'system',ai:'ai',cost:'cost',billing:'billing',compensation:'compensation',auditlog:'auditlog',bulk:'bulk',corp:'corps',brand:'brands',store:'stores'}[currentView.type]||currentView.type;
```

- [ ] **Step 3: renderPage() に orders 分岐を追加**

461行目の `users` 分岐の直後に以下を追加:

```js
  else if(v.type==='orders'){el.innerHTML=renderOrdersPage();initOrdersPage();}
```

- [ ] **Step 4: renderPage() の冒頭に、orders 以外のページに切り替わった場合の realtime クリーンアップを追加**

454行目の `function renderPage(){` の直後、`const el=...` の直前に以下を追加:

```js
  // orders 以外へ遷移したら realtime をクリーンアップ
  if(currentView.type!=='orders' && typeof stopOrdersRealtime==='function') stopOrdersRealtime();
```

- [ ] **Step 5: ブラウザで表示確認**

- サイドバーに 📋 注文管理 が表示されること
- クリックするとアクティブ状態になり、右ペインが「注文管理」に切り替わること（中身はまだ空でOK）
- 他のページに戻ると、注文管理ページの nav-item が非アクティブになること

- [ ] **Step 6: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): add orders sidebar nav and route scaffold"
```

---

## Task 3: ページ骨格 HTML 関数（renderOrdersPage）+ 状態変数

**Files:**
- Modify: `aiden-admin.html` JS セクション末尾付近（renderAuditLogPage のすぐ後 or 独立セクションとして追記）

- [ ] **Step 1: グローバル状態変数を追加**

`let currentView={...};` の直後（既存のグローバル宣言群の近く）に以下を追加:

```js
// ===== ORDERS SECTION =====
var ordersState = {
  filters: {
    merchantUuid: 'all',   // _uuid or 'all'
    brandUuid:    'all',
    venueUuid:    'all',
    status:       'all',   // 'all' | 'placed' | 'cooking' | 'ready' | 'completed' | 'cancelled'
    createdFrom:  '',
    createdTo:    '',
    pickupFrom:   '',
    pickupTo:     '',
  },
  rows: [],          // 直近 loadOrders() の結果
  loading: false,
  realtimeChannel: null,
};
```

- [ ] **Step 2: renderOrdersPage() を追加**

```js
function renderOrdersPage(){
  // 法人セレクト（全法人 + MERCHANTS）
  var merchantOpts = '<option value="all">全法人</option>' +
    MERCHANTS.map(function(m){
      return '<option value="'+escHtml(m._uuid)+'">'+escHtml(m.name)+'</option>';
    }).join('');
  // ブランド・店舗は初期は全て。initOrdersPage で再描画される
  var brandOpts = '<option value="all">全ブランド</option>' +
    BRANDS.map(function(b){
      return '<option value="'+escHtml(b._uuid)+'">'+escHtml(b.name)+'</option>';
    }).join('');
  var venueOpts = '<option value="all">全店舗</option>' +
    VENUES.map(function(v){
      return '<option value="'+escHtml(v._uuid)+'">'+escHtml(v.name)+'</option>';
    }).join('');

  var statusOpts = ''
    + '<option value="all">全ステータス</option>'
    + '<option value="placed">受付中（placed）</option>'
    + '<option value="cooking">調理中（cooking）</option>'
    + '<option value="ready">準備完了（ready）</option>'
    + '<option value="completed">完了（completed）</option>'
    + '<option value="cancelled">キャンセル（cancelled）</option>';

  return ''
    + '<div class="page-title">注文管理</div>'
    + '<div class="page-subtitle">プラットフォーム全体の注文横断ビュー（法人／ブランド／店舗で絞り込み）</div>'

    // フィルタバー
    + '<div class="card" style="padding:16px 20px">'
    + '<div class="card-title" style="padding-bottom:12px">🔎 絞り込み</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">法人</label>'
        + '<select id="ordFltMerchant" onchange="ordersOnMerchantChange()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit">'+merchantOpts+'</select></div>'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">ブランド</label>'
        + '<select id="ordFltBrand" onchange="ordersOnBrandChange()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit">'+brandOpts+'</select></div>'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">店舗</label>'
        + '<select id="ordFltVenue" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit">'+venueOpts+'</select></div>'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">ステータス</label>'
        + '<select id="ordFltStatus" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit">'+statusOpts+'</select></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">注文日 From</label>'
        + '<input type="date" id="ordFltCreatedFrom" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit"></div>'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">注文日 To</label>'
        + '<input type="date" id="ordFltCreatedTo" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit"></div>'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">受渡日 From</label>'
        + '<input type="date" id="ordFltPickupFrom" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit"></div>'
      + '<div><label style="font-size:10px;color:var(--text-light);font-weight:600">受渡日 To</label>'
        + '<input type="date" id="ordFltPickupTo" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;width:100%;font-family:inherit"></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px">'
      + '<button class="btn btn-primary btn-sm" onclick="ordersSearch()">🔍 検索</button>'
      + '<button class="btn btn-secondary btn-sm" onclick="ordersReset()">↻ リセット</button>'
      + '<div style="margin-left:auto;font-size:10px;color:var(--text-light);align-self:center" id="ordersRealtimeStatus">リアルタイム: 接続中...</div>'
    + '</div>'
    + '</div>'

    // 結果テーブル
    + '<div class="card" style="padding:0;overflow:hidden">'
    + '<div id="ordersTableBody" style="padding:20px;color:#888;text-align:center">読み込み中...</div>'
    + '</div>';
}
```

- [ ] **Step 3: initOrdersPage() を追加**

```js
function initOrdersPage(){
  // 状態リセット（フィルタは保持しない。ナビ毎にクリーン）
  ordersState.filters = {
    merchantUuid:'all', brandUuid:'all', venueUuid:'all', status:'all',
    createdFrom:'', createdTo:'', pickupFrom:'', pickupTo:''
  };
  ordersState.rows = [];
  // 初回ロード
  loadOrders();
  // Realtime
  startOrdersRealtime();
}
```

- [ ] **Step 4: 静的確認**

- `goTo('orders')` でページタイトルとフィルタバー、「読み込み中...」が表示されること
- セレクトが全法人／全ブランド／全店舗で埋まっていること
- 検索/リセットボタンが表示されていること（クリックしてもまだ動かない）

- [ ] **Step 5: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): add orders page layout with filters"
```

---

## Task 4: 法人→ブランド→店舗のカスケードハンドラ

**Files:**
- Modify: `aiden-admin.html`（renderOrdersPage の後に追記）

- [ ] **Step 1: ordersOnMerchantChange / ordersOnBrandChange を追加**

```js
function ordersOnMerchantChange(){
  var sel = document.getElementById('ordFltMerchant');
  var merchantUuid = sel ? sel.value : 'all';
  ordersState.filters.merchantUuid = merchantUuid;
  // ブランド select を再構築
  var brands;
  if(merchantUuid === 'all'){
    brands = BRANDS;
  }else{
    var m = MERCHANTS.find(function(x){return x._uuid===merchantUuid;});
    brands = m ? getBrandsForMerchant(m) : [];
  }
  var brandSel = document.getElementById('ordFltBrand');
  if(brandSel){
    brandSel.innerHTML = '<option value="all">全ブランド</option>' +
      brands.map(function(b){
        return '<option value="'+escHtml(b._uuid)+'">'+escHtml(b.name)+'</option>';
      }).join('');
  }
  ordersState.filters.brandUuid = 'all';
  // 店舗も再構築
  ordersOnBrandChange();
}

function ordersOnBrandChange(){
  var sel = document.getElementById('ordFltBrand');
  var brandUuid = sel ? sel.value : 'all';
  ordersState.filters.brandUuid = brandUuid;

  var venues;
  if(brandUuid !== 'all'){
    var b = BRANDS.find(function(x){return x._uuid===brandUuid;});
    venues = b ? getVenuesForBrand(b) : [];
  }else if(ordersState.filters.merchantUuid !== 'all'){
    var m = MERCHANTS.find(function(x){return x._uuid===ordersState.filters.merchantUuid;});
    venues = m ? getVenuesForMerchant(m) : [];
  }else{
    venues = VENUES;
  }
  var venueSel = document.getElementById('ordFltVenue');
  if(venueSel){
    venueSel.innerHTML = '<option value="all">全店舗</option>' +
      venues.map(function(v){
        return '<option value="'+escHtml(v._uuid)+'">'+escHtml(v.name)+'</option>';
      }).join('');
  }
  ordersState.filters.venueUuid = 'all';
}
```

- [ ] **Step 2: ブラウザ確認**

- 法人セレクトで特定の法人を選ぶと、ブランドセレクトがその法人配下だけに絞られる
- ブランドセレクトで特定ブランドを選ぶと、店舗セレクトがそのブランド配下だけに絞られる
- 「全法人」「全ブランド」に戻すと全部に戻る

- [ ] **Step 3: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): add merchant→brand→venue cascade filter"
```

---

## Task 5: 注文読み込み + テーブル描画（loadOrders / renderOrdersTable）

**Files:**
- Modify: `aiden-admin.html`（前タスクの後に追記）

- [ ] **Step 1: loadOrders() を追加**

```js
async function loadOrders(){
  var bodyEl = document.getElementById('ordersTableBody');
  if(!bodyEl) return;
  if(ordersState.loading) return;
  ordersState.loading = true;
  bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:#888"><div class="spinner" style="margin:0 auto 12px"></div>読み込み中...</div>';

  try{
    var f = ordersState.filters;
    var q = sb.from('orders').select(
      'id, display_id, venue_id, brand_id, merchant_id, order_type, '
      + 'tracking_status, payment_status, total_amount, '
      + 'customer_name, customer_email, customer_phone, '
      + 'channel, notes, pickup_at, created_at, member_id'
    ).order('created_at', {ascending: false}).limit(500);

    if(f.merchantUuid !== 'all') q = q.eq('merchant_id', f.merchantUuid);
    if(f.brandUuid    !== 'all') q = q.eq('brand_id',    f.brandUuid);
    if(f.venueUuid    !== 'all') q = q.eq('venue_id',    f.venueUuid);
    if(f.status !== 'all'){
      // 「completed」には delivered/picked_up も含める（未決事項2・案B）
      if(f.status === 'completed') q = q.in('tracking_status', ['completed','delivered','picked_up']);
      else q = q.eq('tracking_status', f.status);
    }
    if(f.createdFrom) q = q.gte('created_at', f.createdFrom + 'T00:00:00');
    if(f.createdTo)   q = q.lte('created_at', f.createdTo   + 'T23:59:59');
    if(f.pickupFrom)  q = q.gte('pickup_at',  f.pickupFrom  + 'T00:00:00');
    if(f.pickupTo)    q = q.lte('pickup_at',  f.pickupTo    + 'T23:59:59');

    var res = await q;
    if(res.error) throw res.error;
    ordersState.rows = res.data || [];
    renderOrdersTable(ordersState.rows);
  }catch(e){
    console.error('loadOrders error:', e);
    bodyEl.innerHTML = '<div style="padding:24px;color:var(--danger)">読み込みエラー: '+escHtml(e.message||String(e))+'</div>';
  }finally{
    ordersState.loading = false;
  }
}
```

- [ ] **Step 2: renderOrdersTable() を追加**

```js
function renderOrdersTable(rows){
  var bodyEl = document.getElementById('ordersTableBody');
  if(!bodyEl) return;
  if(!rows || !rows.length){
    bodyEl.innerHTML = '<div class="empty-state">該当する注文はありません</div>';
    return;
  }
  // venue/brand/merchant の display_id + name を解決するインデックスを作成
  var venueMap = {};   VENUES.forEach(function(v){ venueMap[v._uuid]=v; });
  var brandMap = {};   BRANDS.forEach(function(b){ brandMap[b._uuid]=b; });
  var merchMap = {};   MERCHANTS.forEach(function(m){ merchMap[m._uuid]=m; });

  var html = '<table class="data-table" style="width:100%">'
    + '<thead><tr>'
      + '<th>注文ID</th>'
      + '<th>区分</th>'
      + '<th>顧客名</th>'
      + '<th>法人 / ブランド / 店舗</th>'
      + '<th class="r">金額</th>'
      + '<th>注文ステータス</th>'
      + '<th>決済</th>'
      + '<th>注文日時</th>'
      + '<th>受渡日時</th>'
      + '<th style="text-align:right">操作</th>'
    + '</tr></thead><tbody>';

  for(var i=0;i<rows.length;i++){
    var o = rows[i];
    var v = venueMap[o.venue_id];
    var b = brandMap[o.brand_id];
    var m = merchMap[o.merchant_id];
    var merchantName = m ? m.name : '—';
    var brandName    = b ? b.name : '—';
    var venueName    = v ? v.name : '—';
    var hier = escHtml(merchantName) + ' / ' + escHtml(brandName) + ' / ' + escHtml(venueName);

    var createdStr = o.created_at ? new Date(o.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '—';
    var pickupStr  = o.pickup_at  ? new Date(o.pickup_at ).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '—';

    var amount = typeof o.total_amount==='number' ? ('¥' + o.total_amount.toLocaleString()) : '—';
    var custName = o.customer_name || '—';  // 未決事項4: 会員JOINは後続対応
    var typeLabel = ({dinein:'店内', takeout:'テイクアウト', delivery:'デリバリー'})[o.order_type] || escHtml(o.order_type||'—');

    html += '<tr>'
      + '<td><code style="font-size:11px;background:#f5f6fa;padding:2px 6px;border-radius:4px">'+escHtml(o.display_id||o.id.substring(0,8))+'</code></td>'
      + '<td>'+typeLabel+'</td>'
      + '<td>'+escHtml(custName)+'</td>'
      + '<td style="font-size:11px">'+hier+'</td>'
      + '<td class="r" style="font-weight:700">'+amount+'</td>'
      + '<td>'+ordersStatusBadge(o.tracking_status)+'</td>'
      + '<td>'+ordersPaymentBadge(o.payment_status)+'</td>'
      + '<td style="font-size:11px;color:var(--text-light);white-space:nowrap">'+escHtml(createdStr)+'</td>'
      + '<td style="font-size:11px;color:var(--text-light);white-space:nowrap">'+escHtml(pickupStr)+'</td>'
      + '<td style="text-align:right">'+renderOrderRowActions(o)+'</td>'
    + '</tr>';
  }
  html += '</tbody></table>';
  bodyEl.innerHTML = html;
}

function ordersStatusBadge(s){
  var styles = {
    placed:    'background:#ffeaa7;color:#d68910',
    cooking:   'background:#a29bfe33;color:#6c5ce7',
    ready:     'background:#74b9ff33;color:#0984e3',
    completed: 'background:#e6f9f0;color:#00b894',
    delivered: 'background:#e6f9f0;color:#00b894',
    picked_up: 'background:#e6f9f0;color:#00b894',
    cancelled: 'background:#fab1a0;color:#d63031',
  };
  var labels = {
    placed:'受付中', cooking:'調理中', ready:'準備完了',
    completed:'完了', delivered:'配達済', picked_up:'受取済',
    cancelled:'キャンセル'
  };
  var st = styles[s] || 'background:#dfe6e9;color:#636e72';
  var lb = labels[s] || (s||'—');
  return '<span class="status" style="'+st+'">'+escHtml(lb)+'</span>';
}

function ordersPaymentBadge(s){
  var map = {
    pending:'保留',authorized:'与信済',captured:'確定',failed:'失敗',
    refunded:'返金済',partially_refunded:'一部返金',disputed:'係争中',paid:'支払済'
  };
  var styles = {
    captured:'background:#e6f9f0;color:#00b894',
    authorized:'background:#ffeaa7;color:#d68910',
    failed:'background:#fab1a0;color:#d63031',
    refunded:'background:#dfe6e9;color:#636e72',
  };
  var st = styles[s] || 'background:#dfe6e9;color:#636e72';
  return '<span class="status" style="'+st+'">'+escHtml(map[s]||s||'—')+'</span>';
}

function renderOrderRowActions(o){
  var btns = '<button class="btn btn-secondary btn-sm" onclick="openOrderDetailModal(\''+escHtml(o.id)+'\')">詳細</button>';
  if(o.tracking_status==='placed'){
    btns += ' <button class="btn btn-primary btn-sm" onclick="advanceOrderStatus(\''+escHtml(o.id)+'\',\'placed\',\'cooking\')">受注</button>';
    btns += ' <button class="btn btn-sm" style="background:#d63031;color:#fff" onclick="cancelOrder(\''+escHtml(o.id)+'\',\'placed\')">キャンセル</button>';
  }else if(o.tracking_status==='cooking'){
    btns += ' <button class="btn btn-primary btn-sm" onclick="advanceOrderStatus(\''+escHtml(o.id)+'\',\'cooking\',\'ready\')">準備完了</button>';
    btns += ' <button class="btn btn-sm" style="background:#d63031;color:#fff" onclick="cancelOrder(\''+escHtml(o.id)+'\',\'cooking\')">キャンセル</button>';
  }else if(o.tracking_status==='ready'){
    btns += ' <button class="btn btn-primary btn-sm" onclick="advanceOrderStatus(\''+escHtml(o.id)+'\',\'ready\',\'completed\')">完了</button>';
  }
  return btns;
}
```

- [ ] **Step 3: ordersSearch / ordersReset を追加**

```js
function ordersSearch(){
  var f = ordersState.filters;
  f.merchantUuid = (document.getElementById('ordFltMerchant')||{}).value || 'all';
  f.brandUuid    = (document.getElementById('ordFltBrand')   ||{}).value || 'all';
  f.venueUuid    = (document.getElementById('ordFltVenue')   ||{}).value || 'all';
  f.status       = (document.getElementById('ordFltStatus')  ||{}).value || 'all';
  f.createdFrom  = (document.getElementById('ordFltCreatedFrom')||{}).value || '';
  f.createdTo    = (document.getElementById('ordFltCreatedTo')  ||{}).value || '';
  f.pickupFrom   = (document.getElementById('ordFltPickupFrom') ||{}).value || '';
  f.pickupTo     = (document.getElementById('ordFltPickupTo')   ||{}).value || '';
  loadOrders();
}

function ordersReset(){
  ordersState.filters = {
    merchantUuid:'all', brandUuid:'all', venueUuid:'all', status:'all',
    createdFrom:'', createdTo:'', pickupFrom:'', pickupTo:''
  };
  // UI も再描画
  var v = currentView;
  if(v.type==='orders'){
    document.getElementById('content').innerHTML = renderOrdersPage();
    initOrdersPage();
  }
}
```

- [ ] **Step 4: 動作確認**

- 注文管理を開くと、最新500件の注文が表示される
- 各カラム（注文ID / 区分 / 顧客名 / 法人/ブランド/店舗 / 金額 / ステータス / 決済 / 注文日時 / 受渡日時 / 操作）が埋まる
- ステータスごとに色分けバッジが表示される
- 「受注」「準備完了」「完了」「キャンセル」ボタンがステータスに応じて出現する（**まだ押せない**、次タスク）
- 法人/ブランド/店舗フィルタ + 検索ボタンで結果が変わる
- リセットボタンで全件に戻る
- 日付フィルタも効く

- [ ] **Step 5: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): load and render orders table with filters"
```

---

## Task 6: ステータス進行（楽観的ロック付き） + audit_log

**Files:**
- Modify: `aiden-admin.html`（前タスクの後に追記）

- [ ] **Step 1: advanceOrderStatus() を追加**

```js
async function advanceOrderStatus(orderId, expectedCurrent, newStatus){
  try{
    // 1. 楽観的ロック: 期待するステータスと一致しないと更新しない
    var upd = await sb.from('orders')
      .update({tracking_status: newStatus})
      .eq('id', orderId)
      .eq('tracking_status', expectedCurrent)
      .select('id, tracking_status')
      .maybeSingle();
    if(upd.error) throw upd.error;
    if(!upd.data){
      showToast('❌ ステータスが変更されています。画面を更新してください');
      loadOrders();
      return;
    }
    // 2. 監査ログ
    await logAudit('advance_order_status', 'orders', orderId, {
      from: expectedCurrent, to: newStatus, operated_by: 'admin_master'
    });
    showToast('✅ ステータスを更新しました');
    // 3. 再読み込み
    loadOrders();
  }catch(e){
    console.error('advanceOrderStatus error:', e);
    showToast('❌ 更新に失敗しました: '+(e.message||String(e)));
  }
}
```

- [ ] **Step 2: cancelOrder() を追加**

```js
async function cancelOrder(orderId, currentStatus){
  if(!confirm('この注文をキャンセルしますか？この操作は取り消せません。')) return;
  try{
    var upd = await sb.from('orders')
      .update({tracking_status: 'cancelled'})
      .eq('id', orderId)
      .in('tracking_status', ['placed','cooking'])
      .select('id, tracking_status')
      .maybeSingle();
    if(upd.error) throw upd.error;
    if(!upd.data){
      showToast('❌ キャンセルできない状態です（既に進行中/完了）');
      loadOrders();
      return;
    }
    await logAudit('cancel_order', 'orders', orderId, {
      from: currentStatus, to: 'cancelled', operated_by: 'admin_master'
    });
    showToast('✅ 注文をキャンセルしました');
    // 4. Stripe与信キャンセルの案内
    openModal(
      '<h3>Stripe 与信キャンセルが必要です</h3>'
      + '<p style="font-size:13px;line-height:1.8;color:var(--text);margin-bottom:20px">'
      + 'DB上のキャンセル処理は完了しました。<br>'
      + 'ただし<strong>Stripe 与信（Payment Intent）のキャンセルは自動で実行されません。</strong><br>'
      + 'Stripeダッシュボードから該当の Payment Intent を手動でキャンセル（void）してください。'
      + '</p>'
      + '<div style="background:#f5f6fa;padding:12px 16px;border-radius:8px;font-size:12px;margin-bottom:20px">'
      + '<div style="font-weight:700;margin-bottom:6px">📋 対応手順</div>'
      + '<ol style="margin-left:18px;line-height:1.8">'
      + '<li>Stripe ダッシュボード → 支払い</li>'
      + '<li>該当の注文ID（display_id）で検索</li>'
      + '<li>「キャンセル」ボタンで与信を解放</li>'
      + '</ol></div>'
      + '<div style="text-align:right"><button class="btn btn-primary" onclick="closeModal()">了解しました</button></div>'
    );
    loadOrders();
  }catch(e){
    console.error('cancelOrder error:', e);
    showToast('❌ キャンセルに失敗しました: '+(e.message||String(e)));
  }
}
```

- [ ] **Step 3: 動作確認**

`_test_` プレフィックス付きのテスト注文を1件作成（or 既存の開発環境のテスト注文を使用）し:
- **placed → cooking**: 「受注」ボタンクリック → トースト「✅ ステータスを更新しました」 → テーブル再描画
- **cooking → ready**: 「準備完了」ボタン
- **ready → completed**: 「完了」ボタン
- **placed → cancelled**: 「キャンセル」ボタン → confirm → 成功 → Stripe案内モーダル表示 → 閉じられる
- **楽観的ロック検証**: 2 タブで開き、片方で受注 → もう片方で受注 → 2 回目は「ステータスが変更されています」エラー

- [ ] **Step 4: audit_logs 確認**

Supabase SQL Editor:
```sql
SELECT created_at, user_email, action, target_id, details
FROM audit_logs
WHERE action IN ('advance_order_status','cancel_order')
ORDER BY created_at DESC LIMIT 10;
```
- 全操作が記録されていることを確認

- [ ] **Step 5: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): add order status transitions with optimistic lock"
```

---

## Task 7: 注文詳細モーダル（openOrderDetailModal）

**Files:**
- Modify: `aiden-admin.html`（前タスクの後に追記）

- [ ] **Step 1: openOrderDetailModal() を追加**

```js
async function openOrderDetailModal(orderId){
  openModal('<div style="padding:40px;text-align:center;color:#888"><div class="spinner" style="margin:0 auto 12px"></div>読み込み中...</div>');
  try{
    // 1) 注文本体 + order_items を JOIN 取得
    var res = await sb.from('orders').select(
      'id, display_id, venue_id, brand_id, merchant_id, order_type, channel, notes, '
      + 'tracking_status, payment_status, payment_intent_id, '
      + 'total_amount, delivery_fee, service_fee, surcharge_amount, '
      + 'customer_name, customer_email, customer_phone, '
      + 'created_at, pickup_at, member_id, '
      + 'order_items(id, product_id, size_id, quantity, unit_price, subtotal, product_name)'
    ).eq('id', orderId).single();
    if(res.error) throw res.error;
    var o = res.data;
    if(!o){ openModal('<p>注文が見つかりませんでした</p><div style="text-align:right"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>'); return; }

    // 2) 階層解決
    var v = VENUES.find(function(x){return x._uuid===o.venue_id;});
    var b = BRANDS.find(function(x){return x._uuid===o.brand_id;});
    var m = MERCHANTS.find(function(x){return x._uuid===o.merchant_id;});

    // 3) 商品名の解決（product_name が NULL の場合 products テーブルからフォールバック）
    var items = o.order_items || [];
    var missingProductIds = items.filter(function(it){return !it.product_name && it.product_id;}).map(function(it){return it.product_id;});
    var productNameMap = {};
    if(missingProductIds.length){
      var pRes = await sb.from('products').select('id,name').in('id', missingProductIds);
      if(!pRes.error && pRes.data){
        pRes.data.forEach(function(p){ productNameMap[p.id]=p.name; });
      }
    }

    // 4) HTML 構築
    var typeLabel = ({dinein:'店内', takeout:'テイクアウト', delivery:'デリバリー'})[o.order_type] || escHtml(o.order_type||'—');
    var createdStr = o.created_at ? new Date(o.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '—';
    var pickupStr  = o.pickup_at  ? new Date(o.pickup_at ).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '—';

    var itemsHtml = '';
    if(items.length){
      itemsHtml += '<table class="data-table" style="width:100%;font-size:12px">'
        + '<thead><tr><th>商品名</th><th class="r">数量</th><th class="r">単価</th><th class="r">小計</th></tr></thead><tbody>';
      items.forEach(function(it){
        var pname = it.product_name || productNameMap[it.product_id] || '商品';
        itemsHtml += '<tr>'
          + '<td>'+escHtml(pname)+'</td>'
          + '<td class="r">'+(it.quantity||0)+'</td>'
          + '<td class="r">¥'+((it.unit_price||0).toLocaleString())+'</td>'
          + '<td class="r" style="font-weight:700">¥'+((it.subtotal||0).toLocaleString())+'</td>'
        + '</tr>';
      });
      itemsHtml += '</tbody></table>';
    }else{
      itemsHtml = '<div class="empty-state" style="padding:20px">商品明細がありません</div>';
    }

    function row(label,value){
      return '<div style="display:flex;padding:6px 0;border-bottom:1px solid #f0f0f0"><div style="width:120px;font-size:11px;color:var(--text-light);font-weight:600">'+escHtml(label)+'</div><div style="flex:1;font-size:12px">'+value+'</div></div>';
    }

    var html = ''
      + '<h3>注文詳細 <code style="font-size:12px;background:#f5f6fa;padding:2px 8px;border-radius:4px;margin-left:8px">'+escHtml(o.display_id||o.id.substring(0,8))+'</code></h3>'
      + '<button class="modal-close" onclick="closeModal()">✕</button>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px">'

      // 左カラム: 注文基本情報
      + '<div><div class="card-title" style="font-size:12px">📋 注文情報</div>'
      + row('ステータス', ordersStatusBadge(o.tracking_status))
      + row('決済', ordersPaymentBadge(o.payment_status))
      + row('区分', escHtml(typeLabel))
      + row('チャネル', escHtml(o.channel||'—'))
      + row('注文日時', escHtml(createdStr))
      + row('受渡日時', escHtml(pickupStr))
      + row('備考', escHtml(o.notes||'—'))
      + row('PaymentIntent', o.payment_intent_id?('<code style="font-size:10px">'+escHtml(o.payment_intent_id)+'</code>'):'—')
      + '</div>'

      // 右カラム: 顧客 + 階層
      + '<div><div class="card-title" style="font-size:12px">👤 顧客情報</div>'
      + row('氏名', escHtml(o.customer_name||'—'))
      + row('電話', escHtml(o.customer_phone||'—'))
      + row('メール', escHtml(o.customer_email||'—'))
      + row('種別', o.member_id?'会員':'ゲスト')
      + '<div class="card-title" style="font-size:12px;margin-top:16px">🏢 階層</div>'
      + row('法人', escHtml(m?m.name:'—'))
      + row('ブランド', escHtml(b?b.name:'—'))
      + row('店舗', escHtml(v?v.name:'—'))
      + '</div>'
      + '</div>'

      // 商品明細
      + '<div style="margin-top:24px"><div class="card-title" style="font-size:12px">🍽️ 商品明細</div>'
      + itemsHtml
      + '</div>'

      // 金額
      + '<div style="margin-top:16px;padding:12px 16px;background:#f5f6fa;border-radius:8px;font-size:12px">'
      + row('商品合計', '¥'+Math.max(0,(o.total_amount||0)-(o.delivery_fee||0)-(o.service_fee||0)-(o.surcharge_amount||0)).toLocaleString())
      + (o.delivery_fee ? row('配達料', '¥'+(o.delivery_fee||0).toLocaleString()) : '')
      + (o.service_fee  ? row('サービス料','¥'+(o.service_fee||0).toLocaleString())  : '')
      + (o.surcharge_amount ? row('少額注文手数料','¥'+(o.surcharge_amount||0).toLocaleString()) : '')
      + '<div style="display:flex;padding:10px 0 0;margin-top:6px;border-top:2px solid var(--border)"><div style="width:120px;font-size:12px;color:var(--text);font-weight:700">合計</div><div style="flex:1;font-size:16px;font-weight:800;color:var(--accent)">¥'+(o.total_amount||0).toLocaleString()+'</div></div>'
      + '</div>'

      + '<div style="text-align:right;margin-top:20px"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>';

    openModal(html, true);
  }catch(e){
    console.error('openOrderDetailModal error:', e);
    openModal('<p style="color:var(--danger)">読み込みエラー: '+escHtml(e.message||String(e))+'</p><div style="text-align:right"><button class="btn btn-secondary" onclick="closeModal()">閉じる</button></div>');
  }
}
```

- [ ] **Step 2: 動作確認**

- 各注文行の「詳細」ボタンクリック → モーダルが開く
- 注文情報 / 顧客情報 / 階層 / 商品明細 / 金額 がすべて正しく表示される
- ESCキーで閉じる（既存の `document.addEventListener('keydown')` で動作するはず）
- 背景クリックで閉じる（既存の `modalOverlay` のクリックハンドラ）
- 閉じるボタンで閉じる
- ゲスト注文（member_id=NULL）でも会員注文でも正しく「種別」を表示

- [ ] **Step 3: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): add order detail modal with items breakdown"
```

---

## Task 8: Realtime サブスクリプション（startOrdersRealtime / stopOrdersRealtime）

**Files:**
- Modify: `aiden-admin.html`（前タスクの後に追記）

- [ ] **Step 1: startOrdersRealtime() を追加**

```js
function startOrdersRealtime(){
  stopOrdersRealtime(); // 既存チャンネルがあれば解除
  try{
    var ch = sb.channel('admin-orders-realtime')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'orders'}, function(payload){
        if(currentView.type!=='orders') return;
        // 最新一覧を再読み込み
        loadOrders();
      })
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'orders'}, function(payload){
        if(currentView.type!=='orders') return;
        loadOrders();
      })
      .subscribe(function(status){
        var el = document.getElementById('ordersRealtimeStatus');
        if(!el) return;
        if(status==='SUBSCRIBED'){
          el.innerHTML = '<span style="color:var(--success)">●</span> リアルタイム: 接続中';
        }else if(status==='CHANNEL_ERROR' || status==='TIMED_OUT'){
          el.innerHTML = '<span style="color:var(--danger)">●</span> リアルタイム: 切断';
        }
      });
    ordersState.realtimeChannel = ch;
  }catch(e){
    console.error('startOrdersRealtime error:', e);
  }
}

function stopOrdersRealtime(){
  if(ordersState.realtimeChannel){
    try{ sb.removeChannel(ordersState.realtimeChannel); }catch(_){}
    ordersState.realtimeChannel = null;
  }
}
```

- [ ] **Step 2: 動作確認**

- 注文管理ページを開き、ページ上部に「● リアルタイム: 接続中」が緑で表示される
- 別タブで新規注文を作成（aiden-order-store.html から） → 管理マスタの一覧に自動反映
- 別タブで注文ステータスを更新 → 管理マスタに自動反映
- 「他ページ（例: 法人管理）」へ移動 → `stopOrdersRealtime()` が呼ばれチャンネルが解放される
- 再度「注文管理」へ移動 → 再購読

- [ ] **Step 3: 負荷 / 過剰更新の確認**

- 連続した UPDATE イベントで再 fetch が過剰にならないか軽くデバウンス化するか検討
  - **デフォルト**: 本タスクではデバウンスしない（スコープ外）
  - 必要なら 500ms のデバウンスを後続でTaiseiに相談

- [ ] **Step 4: コミット**

```bash
git add aiden-admin.html
git commit -m "feat(admin): add realtime subscription for orders page"
```

---

## Task 9: 最終確認 + Lint + デプロイ + 本番確認

- [ ] **Step 1: npm run lint 実行**

```bash
npm run lint
```
- console.log 残存ゼロを確認
- エラーゼロ

- [ ] **Step 2: 既存機能への影響確認**

- ダッシュボード / 法人管理 / ブランド管理 / 店舗管理 / メニュー管理 / ユーザー管理 / システム設定 / AI品質管理 / コスト管理 / 請求管理 / 補償管理 / 操作ログ / データ一括管理 の全ページを開き、描画が壊れていないことを確認

- [ ] **Step 3: D-83 ハードコードチェック**

- `_test_` / `dummy` / `sample` 等のハードコード注文データが一切含まれていないことを目視確認
- 表示される全データが Supabase から取得されていること

- [ ] **Step 4: git pull --rebase + push**

```bash
git pull --rebase origin main
git push origin main
```

- [ ] **Step 5: vercel --prod でデプロイ**

```bash
vercel --prod
```

- [ ] **Step 6: 本番URL動作確認**

- https://aiden-jp.net/aiden-admin.html を開く
- ログイン → サイドバーに「📋 注文管理」
- 全件表示 / フィルタ / カスケード / 検索 / リセット / 詳細モーダル / ステータス進行 / キャンセル + Stripe案内 / Realtime の各項目を本番で確認
- 完了基準チェックリスト（依頼書）を1つずつ潰す

- [ ] **Step 7: 完了報告**

diff / 本番URL動作結果 / 未確認項目 / 手動作業（なし想定）をまとめて報告

---

## Self-Review

### Spec coverage
- ✅ サイドバー配置（users と system の間）→ Task 2
- ✅ フィルタバー（法人/ブランド/店舗/ステータス/注文日/受渡日/検索/リセット）→ Task 3 + 4 + 5
- ✅ 注文一覧テーブル（全カラム + 操作ボタン）→ Task 5
- ✅ 注文詳細モーダル → Task 7
- ✅ リアルタイム更新（'admin-orders-realtime'）→ Task 8
- ✅ ステータス進行（楽観的ロック付き）→ Task 6
- ✅ キャンセル（確認ダイアログ + Stripe案内モーダル）→ Task 6
- ✅ audit_logs 記録（全操作）→ Task 6
- ✅ ハードコード禁止（D-83）→ 全タスクでDBから取得
- ✅ ESCキーでモーダル閉じ → 既存の 150 行目で対応済み
- ✅ 既存ページへの影響ゼロ → Task 9 で確認

### Placeholder scan
- TODO / TBD / 未実装などの残留なし（全コードが完全な形で記述されている）

### Type consistency
- `ordersState.filters.merchantUuid` は全タスクで一貫して使用
- `tracking_status` の値は `placed / cooking / ready / completed / cancelled` に加えて Realtime 取得時の `delivered / picked_up` もバッジで対応
- `venue_id / brand_id / merchant_id` の命名で統一（旧 store_id/corp_id は使わない）

### Undefined references
- `ordersPaymentBadge`, `ordersStatusBadge`, `renderOrderRowActions` は Task 5 で定義
- `openOrderDetailModal`, `advanceOrderStatus`, `cancelOrder` は Task 6/7 で定義
- `loadOrders`, `renderOrdersPage`, `initOrdersPage`, `ordersSearch`, `ordersReset`, `ordersOnMerchantChange`, `ordersOnBrandChange`, `startOrdersRealtime`, `stopOrdersRealtime` は Task 3/4/5/8 で定義
- 既存関数（`escHtml`, `showToast`, `openModal`, `closeModal`, `logAudit`, `getBrandsForMerchant`, `getVenuesForBrand`, `getVenuesForMerchant`, `sb`, `MERCHANTS`, `BRANDS`, `VENUES`, `currentView`）は aiden-admin.html に既存

---

## 完了判定チェックリスト（依頼書から）

- [ ] サイドバーに「📋 注文管理」が表示される
- [ ] フィルター条件でDBから注文一覧が取得・表示される
- [ ] 法人→ブランド→店舗のセレクトが動的に連動する
- [ ] ステータス進行ボタンが正しく動作する（楽観的ロック付き）
- [ ] キャンセルが確認ダイアログ付きで動作する
- [ ] 注文詳細モーダルに商品明細が表示される
- [ ] Realtimeで新規注文が自動反映される
- [ ] 全操作がaudit_logsに記録される
- [ ] 本番URL(aiden-jp.net/aiden-admin.html)での動作確認
