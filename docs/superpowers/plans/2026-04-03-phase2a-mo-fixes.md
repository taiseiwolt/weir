# Phase 2A: MO3画面 先行バッチ修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MO3画面（order / order-store / order-checkout）の確定済み14項目のUI/UXバグ修正・改善を実装する

**Architecture:** 各HTMLファイルの個別修正。共通ファイル（weir-common.js/css）への変更はサインインボタンのonclick追加のみ。sessionStorageを使ったページ間データ受け渡し改善。

**Tech Stack:** Vanilla JS, Leaflet (map pins), Supabase JS Client v2, sessionStorage

---

## File Structure

| Action | File | Changes |
|--------|------|---------|
| Modify | `weir-order.html` | マップピンブランドカラー化、住所データsessionStorage保存、確認テキスト1行化 |
| Modify | `weir-order-store.html` | タイトルホワイトラベル化、beforeunload削除、初期通知非表示、サインイン接続、住所引継ぎ |
| Modify | `weir-order-checkout.html` | 住所プリフィル、クーポンUI改善、チャットウィジェット追加 |
| Modify | `weir-common.js` | サインインボタンにonclick属性追加（各ページのコールバック呼出し） |

---

## Task 1: weir-order.html — マップピンをブランドカラー化

**Files:**
- Modify: `weir-order.html:1184-1205`

- [ ] **Step 1: makeStoreIcon()のハードコードカラーをCSS変数から取得に変更**

`weir-order.html` line 1184-1205 の `makeStoreIcon` 関数を修正:

```javascript
function makeStoreIcon(s, hl){
  // Get brand color from CSS variable (falls back to #D32F2F)
  var brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#D32F2F';
  var bg     = hl ? brandColor : (s.avail === 'full' ? '#bbb' : '#1a1a1a');
  var border = hl ? '#fff' : '#fff';
  var shadow = hl ? '0 2px 8px rgba(0,0,0,.45)' : '0 2px 6px rgba(0,0,0,.35)';
```

変更点: line 1185 の `'#D32F2F'` → `brandColor` (CSS変数から取得)。shadow色もハードコードRGBAを汎用化。

- [ ] **Step 2: ピンhover時のブランドカラー適用**

各ストアカードにmouseenter/mouseleaveイベントを追加。`renderStoreList()` 関数内の各カードHTML生成後に追加:

カード生成部分（`renderStoreList` 内）で、各カードの `onmouseenter` / `onmouseleave` を追加。既存の `onCardClick` パターンに合わせて、hover時にピンアイコンを一時的にハイライトし、離れたら戻す。

```javascript
// renderStoreList() 内、各カードのイベントリスナー追加箇所
card.addEventListener('mouseenter', function() {
  var m = storeMarkers[s.id];
  if (m) m.setIcon(makeStoreIcon(s, true));
});
card.addEventListener('mouseleave', function() {
  var m = storeMarkers[s.id];
  if (m && selectedStoreId !== s.id) m.setIcon(makeStoreIcon(s, false));
});
```

`storeMarkers` オブジェクト（IDをキーにしてマーカー参照を保存）を追加。既存のマーカー生成箇所で `storeMarkers[s.id] = marker;` で保存。

- [ ] **Step 3: Commit**

```bash
git add weir-order.html
git commit -m "fix: use brand color for map pins with hover highlight"
```

---

## Task 2: weir-order.html — 住所データのsessionStorage保存 + 確認テキスト1行化

**Files:**
- Modify: `weir-order.html:675,975,994,1639-1653,1750-1762`

- [ ] **Step 1: 「こちらでよろしいですか？」を1行にする**

HTML line 675: `<br>` を削除:
```html
<div class="addr-big-title" id="s3-big" data-i18n="s3_big">こちらでよろしいですか？</div>
```

i18n翻訳の `s3_big` キーからも `<br>` を削除。`AidenCommon.addTranslations` 呼出し内の該当キーを修正:
- ja: `'こちらでよろしいですか？'`
- en: `'Does this look correct?'`
- その他言語も同様

- [ ] **Step 2: useAddress()でsessionStorageに住所+座標を保存**

`useAddress()` 関数（line 1639-1653）の末尾に追加:

```javascript
function useAddress(){
  var street   = document.getElementById('addr-street').value.trim();
  var building = document.getElementById('addr-building').value.trim();
  userAddress  = street + (building ? ' ' + building : '');
  userLat = pinLat !== null ? pinLat : pendingLat;
  userLng = pinLng !== null ? pinLng : pendingLng;
  closeAddrModal();
  document.getElementById('addr-btn-text').textContent = userAddress;

  // Save address data to sessionStorage for order-store/checkout pages
  try {
    sessionStorage.setItem('weir_user_address', JSON.stringify({
      address: userAddress,
      lat: userLat,
      lng: userLng,
      street: street,
      building: building
    }));
  } catch(e) {}

  if(mainMap){
    // ... existing map code unchanged
```

- [ ] **Step 3: onOrderBtnClick()のsessionStorageに住所情報を追加**

`onOrderBtnClick()` (line 1750-1762) の `sessionStorage.setItem('weir_selected_store', ...)` に住所フィールドを追加:

```javascript
sessionStorage.setItem('weir_selected_store', JSON.stringify({
  storeId: s.id,
  storeName: s.name,
  storeAddr: s.addr,
  storeStation: s.station,
  storeHours: s.hours,
  hasTakeout: s.hasTakeout,
  hasDelivery: s.hasDelivery,
  orderMode: orderMode,
  userAddress: userAddress,
  userLat: userLat,
  userLng: userLng
}));
```

- [ ] **Step 4: Commit**

```bash
git add weir-order.html
git commit -m "fix: single-line confirm text, save address to sessionStorage for cross-page use"
```

---

## Task 3: weir-order-store.html — タイトルホワイトラベル化 + beforeunload削除

**Files:**
- Modify: `weir-order-store.html:6,1239-1241`

- [ ] **Step 1: ページタイトルからWeirを除去**

Line 6: `<title>モバイルオーダー | Weir</title>` を `<title>モバイルオーダー</title>` に変更。

`onBrandLoaded` コールバック（line 1437-1438）は既に `document.title = (brand.name || '') + ' | メニュー';` で上書きするので、初期値は「モバイルオーダー」でOK。

- [ ] **Step 2: beforeunloadハンドラを削除**

Lines 1239-1241 を削除:
```javascript
// DELETE these lines:
// window.addEventListener('beforeunload', (e) => {
//   if (cart.length > 0) { e.preventDefault(); }
// });
```

同一サイト内遷移（order-store → order-checkout）で「このサイトを離れますか？」が表示される問題を解消。

- [ ] **Step 3: Commit**

```bash
git add weir-order-store.html
git commit -m "fix: remove Weir from title (white-label) and delete beforeunload handler"
```

---

## Task 4: weir-order-store.html — 初期通知非表示 + 住所引き継ぎ

**Files:**
- Modify: `weir-order-store.html:727,1014-1020`

- [ ] **Step 1: 初期通知テキストを空にし非表示にする**

Line 727: デフォルトの「こちらのレストランはあなたのエリアに…」テキストを空にし、初期状態を非表示:
```html
<p class="info-bar-notice" id="infoBarNotice" style="display:none"></p>
```

JS側の `checkDeliveryZone()` でテキストを設定する際に `display:block` に変更する処理を追加（既存コードが `textContent` を設定するだけなので、`style.display = ''` を追加）。

- [ ] **Step 2: sessionStorageから住所データを読み込む**

ページ初期化部分（line 1014付近）に住所読み込みを追加:

```javascript
var stored = JSON.parse(sessionStorage.getItem('weir_selected_store') || '{}');
// Read user address from sessionStorage
var addrData = JSON.parse(sessionStorage.getItem('weir_user_address') || '{}');
let userAddress = addrData.address || stored.userAddress || '';
let userLat = addrData.lat || stored.userLat || null;
let userLng = addrData.lng || stored.userLng || null;
```

住所が存在する場合、配達モードで住所表示UIを更新。既存の `checkDeliveryZone()` 呼出しに座標を渡す。

- [ ] **Step 3: checkout遷移時に住所をsessionStorageに含める**

`goToCheckout()` 関数内の `weir_checkout_data` sessionStorage保存に `userAddress`, `userLat`, `userLng` を追加。

- [ ] **Step 4: Commit**

```bash
git add weir-order-store.html
git commit -m "fix: hide default out-of-area notice, pass address from order page via sessionStorage"
```

---

## Task 5: weir-order-store.html — サインインボタン接続

**Files:**
- Modify: `weir-common.js:424`
- Modify: `weir-order-store.html` (onBrandLoaded callback付近)
- Modify: `weir-order-checkout.html` (signinモーダル関連)

- [ ] **Step 1: weir-common.jsのサインインボタンにid追加**

Line 424 で既にボタンは生成されているが、idがない。`id="weir-header-signin"` を追加:

weir-common.js line 424:
```javascript
'<button class="header-signin" id="weir-header-signin" data-i18n="signin">' + t('signin') + '</button>' +
```

- [ ] **Step 2: order-store.htmlでサインインボタンにクリックハンドラを接続**

`onBrandLoaded` コールバック内（AidenCommon.init後）に追加:

```javascript
// Connect sign-in button to checkout signin modal
var signinBtn = document.getElementById('weir-header-signin');
if (signinBtn) {
  signinBtn.addEventListener('click', function() {
    // Navigate to checkout with signin flag
    goToCheckout();
  });
}
```

**注意:** 現状ではorder-store.htmlにサインインモーダルがないため、チェックアウト画面に遷移してそこでサインインモーダルを表示する設計。「ポップアップでログイン/サインアップ」の完全実装は調査バッチ（Phase 2A-2）で対応。先行バッチではチェックアウト遷移を維持する。

- [ ] **Step 3: Commit**

```bash
git add weir-common.js weir-order-store.html
git commit -m "fix: add id to header signin button and connect click handler"
```

---

## Task 6: weir-order-store.html — ハードコードフォールバック汎用化

**Files:**
- Modify: `weir-order-store.html:945-960`

- [ ] **Step 1: STORE_DATA初期値を汎用的なプレースホルダーに変更**

ハードコードの「東京都渋谷区道玄坂...」等をフォールバック用の汎用値に変更:

```javascript
var STORE_DATA = {
  id: '',
  name: '',
  description: '',
  address: '',
  phone: '',
  lat: 35.6762,
  lng: 139.6503,
  brandName: '',
  brandColor: '',
  // ... other fields with empty defaults
};
```

Supabaseからのデータ取得が成功すれば上書きされる。失敗時は空値表示（エラーメッセージを表示する方が良い）。

- [ ] **Step 2: DB未取得時のフォールバックUI**

`loadFromSupabase()` のcatch内またはstore未取得時に、ユーザーに分かるメッセージを表示:

```javascript
if (!storeData) {
  document.getElementById('infoBarNotice').textContent = '店舗情報の取得に失敗しました。';
  document.getElementById('infoBarNotice').style.display = '';
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add weir-order-store.html
git commit -m "fix: replace hardcoded store fallback with generic defaults and error message"
```

---

## Task 7: weir-order-checkout.html — 住所プリフィル

**Files:**
- Modify: `weir-order-checkout.html` (initPage / loadCheckoutData 付近)

- [ ] **Step 1: sessionStorageから住所を読み込んでフォームにプリフィル**

`initPage()` 内（ `loadCheckoutData()` の後）に追加:

```javascript
// Prefill address from sessionStorage
var addrData = JSON.parse(sessionStorage.getItem('weir_user_address') || '{}');
if (addrData.address) {
  // Show new address form (not saved address dropdown)
  var newAddrForm = document.getElementById('newAddressForm');
  if (newAddrForm) newAddrForm.style.display = '';

  // Parse address parts and fill form fields
  // addrData has: address (full string), street, building, lat, lng
  if (addrData.street) {
    var addrLine = document.getElementById('addrLineInput');
    if (addrLine) addrLine.value = addrData.street;
  }
  if (addrData.building) {
    var addrBuilding = document.getElementById('addrBuildingInput');
    if (addrBuilding) addrBuilding.value = addrData.building;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add weir-order-checkout.html
git commit -m "fix: prefill checkout address form from sessionStorage"
```

---

## Task 8: weir-order-checkout.html — クーポンUI改善

**Files:**
- Modify: `weir-order-checkout.html:646-667`

- [ ] **Step 1: セクションタイトルを変更**

Line 648: `クーポンを使用する` → `クーポンの利用` に変更:
```html
<div class="section-title">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
  クーポンの利用
</div>
```

- [ ] **Step 2: 「使用しない」ラジオオプションを追加**

Lines 650-658のcoupon-radio-groupの先頭に「使用しない」を追加し、デフォルト選択にする:

```html
<div class="coupon-radio-group">
  <div class="coupon-radio active" onclick="selectCouponMode('none')">
    <div class="coupon-radio-dot"></div>
    <span class="coupon-radio-label">使用しない</span>
  </div>
  <div class="coupon-radio" onclick="selectCouponMode('code')">
    <div class="coupon-radio-dot"></div>
    <span class="coupon-radio-label">クーポンコードを入力する</span>
  </div>
  <div class="coupon-radio" onclick="selectCouponMode('list')">
    <div class="coupon-radio-dot"></div>
    <span class="coupon-radio-label">クーポンを利用する</span>
  </div>
</div>
```

- [ ] **Step 3: selectCouponMode()に'none'モードを追加**

`selectCouponMode()` 関数にnoneケースを追加:

```javascript
function selectCouponMode(mode) {
  // Update radio button states
  document.querySelectorAll('.coupon-radio').forEach(function(r, i) {
    var modes = ['none', 'code', 'list'];
    r.classList.toggle('active', modes[i] === mode);
  });

  var codeForm = document.getElementById('couponCodeForm');
  var listEl = document.getElementById('couponList');

  if (mode === 'none') {
    codeForm.classList.remove('show');
    listEl.style.display = 'none';
    // Clear any applied coupon
    appliedCoupon = null;
    document.getElementById('couponApplied').style.display = 'none';
    document.getElementById('couponCodeInput').value = '';
    updatePriceSummary();
  } else if (mode === 'code') {
    codeForm.classList.add('show');
    listEl.style.display = 'none';
  } else if (mode === 'list') {
    codeForm.classList.remove('show');
    listEl.style.display = '';
    loadAvailableCoupons();
  }
}
```

- [ ] **Step 4: 初期表示でコード入力フォームを非表示にする**

Line 660: `class="coupon-code-form show"` → `class="coupon-code-form"` に変更（デフォルト「使用しない」で非表示）:

```html
<div class="coupon-code-form" id="couponCodeForm">
```

- [ ] **Step 5: Commit**

```bash
git add weir-order-checkout.html
git commit -m "fix: rename coupon section, add 'none' option as default, hide code form initially"
```

---

## Task 9: weir-order-checkout.html — チャットウィジェット追加

**Files:**
- Modify: `weir-order-checkout.html` (`</body>` 直前)

- [ ] **Step 1: weir-chat-widget.jsの読込を追加**

`</body>` 直前（`<div id="weir-footer"></div>` の後）に追加:

```html
<script src="weir-chat-widget.js"></script>
<script>
(function(){
  var params = new URLSearchParams(location.search);
  if (typeof WeirChatWidget !== 'undefined') {
    window._weirChat = new WeirChatWidget({
      contextType: 'enduser',
      storeId: params.get('store_id') || params.get('sid') || null,
      supabaseClient: typeof sb !== 'undefined' ? sb : null,
      apiBase: 'https://weir.co.jp',
    });
  }
})();
</script>
```

order-store.html line 2741-2751 と同じパターン。`typeof WeirChatWidget !== 'undefined'` チェックを追加して、ファイル読込失敗時のエラーを防止。

- [ ] **Step 2: Commit**

```bash
git add weir-order-checkout.html
git commit -m "feat: add chat support widget to checkout page"
```

---

## Task 10: 全MO画面リグレッション確認

- [ ] **Step 1: npm run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 2: ブラウザで3ページを確認**

ローカルサーバーで以下を確認:
1. `weir-order.html` — マップピンがブランドカラー、ホバーでハイライト、確認テキスト1行
2. `weir-order-store.html` — タイトルにWeirなし、beforeunloadなし、初期通知非表示
3. `weir-order-checkout.html` — クーポン「使用しない」がデフォルト、チャットウィジェット表示

- [ ] **Step 3: 住所引き継ぎフローを確認**

1. order.html で住所を入力
2. 店舗を選択して order-store.html に遷移
3. 住所が引き継がれていることを確認
4. 会計に進んで order-checkout.html に遷移
5. 住所フォームにプリフィルされていることを確認

- [ ] **Step 4: 問題があれば修正 + 最終Commit**

```bash
git add -A
git commit -m "fix: address Phase 2A regression issues"
```
