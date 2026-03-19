# QA Report - Phase 3: UX Improvements
**Date:** 2026-03-19
**Environment:** https://aiden-jp.net (Vercel prod)
**Test Tool:** Playwright 1.58.2 (Chromium)
**Commit:** 84199fb

---

## Summary

| Bug | Status | Result |
|-----|--------|--------|
| Bug1: MyPage住所管理セクション | PASS | 住所管理セクション・モーダル・全フィールド表示OK |
| Bug2: サービス料ツールチップ | PASS | ?アイコン・ツールチップ要素存在確認OK |
| Bug3: 営業時間外UIフィードバック | PASS | toast表示OK、alert()除去確認、disabled CSS確認 |
| Bug4: フローティングボタン | SKIP | 調査の結果、既に表示・機能済み。対応不要 |
| Bug5: サインインボタン | PASS | onclick追加、ログインモーダル表示OK |
| Bug6: 注文後導線 | PASS | 口コミ・再注文ボタンDOM確認OK |

**Total: 8 tests passed / 0 failed** (初回1件はURL問題で修正後全PASS)

---

## Detailed Results

### Bug1: MyPage住所管理 (aiden-mypage-membership.html)
- [x] 「配達先住所」セクション表示
- [x] 「+ 住所を追加」ボタン表示
- [x] モーダル開閉動作
- [x] ラベル/郵便番号/都道府県/市区町村/番地/建物名フィールド全て表示
- [x] モバイル(375px)でレイアウト崩れなし
- Screenshot: `qa-screenshots/bug1-mypage-address.png`, `qa-screenshots/mobile-mypage.png`

### Bug2: サービス料ツールチップ (aiden-order-checkout.html)
- [x] `.surcharge-info` (?)アイコン存在
- [x] `#surchargeTooltip` 要素存在
- Note: カートデータなしでリダイレクトされるため、DOM存在確認のみ
- Screenshot: `qa-screenshots/bug2-checkout-tooltip.png`

### Bug3: 営業時間外UI (aiden-order-store.html)
- [x] `#toastNotification` 要素存在
- [x] `showClosedToast()` 関数存在・動作確認
- [x] `updateCartButtonForClosedState()` 関数存在
- [x] `getNextOpenTimeText()` 関数存在
- [x] `addToCart()` から `alert()` 除去済み
- [x] `quickAdd()` から `alert()` 除去済み
- [x] Toast表示トリガー正常動作
- Screenshot: `qa-screenshots/bug3-toast-visible.png`

### Bug5: サインインボタン (aiden-order.html)
- [x] `#hdr-signin` に `onclick="handleSignIn()"` 設定済み
- [x] クリックでログインモーダル表示
- [x] メールアドレス/パスワード入力フィールド表示
- [x] ログインボタン表示
- [x] モーダル閉じる動作OK
- [x] モバイル(375px)でモーダルが画面内に収まる (width: 345px)
- Screenshot: `qa-screenshots/bug5-order-signin.png`, `qa-screenshots/mobile-order-signin.png`

### Bug6: 注文後導線 (aiden-order-tracking.html)
- [x] `#postDeliveryActions` コンテナ存在
- [x] 「口コミを書いてポイントGET」ボタン存在 (テキスト確認済み)
- [x] 「もう一度注文する」ボタン存在 (テキスト確認済み)
- [x] `#postDeliveryCoupons` クーポンセクション存在
- [x] チャット(💬)・レシート(🧾)フローティングボタン表示
- [x] デモモード(preparing状態)では非表示 → 正常動作
- Screenshot: `qa-screenshots/bug6-tracking-post-delivery.png`

---

## Mobile Viewport (375px) Tests
- [x] MyPage: 住所追加ボタン幅309px、画面内に収まる
- [x] Order: ログインモーダル幅345px、画面内に収まる
- [x] Tracking: レイアウト崩れなし

---

## Console Errors
- Bug1: なし (Supabase認証未ログイン関連のみ → 想定内)
- Bug3: `Failed to load resource: 406` (Supabase API - 特定クエリのAcceptヘッダー不一致) → 既知・機能影響なし
- Bug5: なし
- Bug6: なし

---

## Known Issues (変更なし)
- ルートURL `/` は 404 (仕様: 各ページに直接アクセス)
- Checkout page はカートデータなしでリダイレクト (仕様通り)
