# モバイルUIUXテスト結果 — 2026-03-31

## サマリ
- 対象ページ: 5ページ
- デバイス: 3デバイス
- テスト項目: 20項目 × 5ページ × 3デバイス = 300チェックポイント
- **PASS: 274件 / FAIL: 26件**

## ページ別結果
| ページ | iPhone SE | iPhone 14 Pro | Galaxy S21 |
|---|---|---|---|
| 店舗選択 | 18/20 (FAIL: 2) | 18/20 (FAIL: 2) | 18/20 (FAIL: 2) |
| メニュー・カート | 18/20 (FAIL: 2) | 18/20 (FAIL: 2) | 18/20 (FAIL: 2) |
| チェックアウト | 18/20 (FAIL: 2) | 18/20 (FAIL: 2) | 18/20 (FAIL: 2) |
| トラッキング | 19/20 (FAIL: 1) | 19/20 (FAIL: 1) | 19/20 (FAIL: 1) |
| ブランドHP | 18/20 (FAIL: 2) | 19/20 (FAIL: 1) | 18/20 (FAIL: 2) |

## FAIL一覧
| # | ページ | デバイス | テスト | 詳細 | スクリーンショット |
|---|---|---|---|---|---|
| 1 | 店舗選択 | iPhone_SE | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: (30x38), (30x38), (30x38), (30x38) | aiden-order_iPhone_SE.png |
| 2 | 店舗選択 | iPhone_SE | UX-19: ボタン間スペース | 近すぎるボタンペア: 1 | aiden-order_iPhone_SE.png |
| 3 | メニュー・カート | iPhone_SE | UX-09: 画面読み込み正常 | title="焼肉 炭火亭 渋谷店 | Weir モバイルオーダー", content=false | aiden-order-store_iPhone_SE.png |
| 4 | メニュー・カート | iPhone_SE | UX-20: コンソールエラーなし | エラー1件: Failed to load resource: the server responded with a status of 400 () | aiden-order-store_iPhone_SE.png |
| 5 | チェックアウト | iPhone_SE | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: EN(42x44) | aiden-order-checkout_iPhone_SE.png |
| 6 | チェックアウト | iPhone_SE | UX-20: コンソールエラーなし | エラー2件: Failed to load resource: the server responded with a status of 400 () | aiden-order-checkout_iPhone_SE.png |
| 7 | トラッキング | iPhone_SE | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: 🏪(36x36), 🛵(40x40) | aiden-order-tracking_iPhone_SE.png |
| 8 | ブランドHP | iPhone_SE | UX-01: テキスト横はみ出し | scrollWidth=382, clientWidth=375 | aiden-brand-sushiro_iPhone_SE.png |
| 9 | ブランドHP | iPhone_SE | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: ☰(39x48), ⏸(44x44) | aiden-brand-sushiro_iPhone_SE.png |
| 10 | 店舗選択 | iPhone_14_Pro | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: (30x38), (30x38), (30x38), (30x38) | aiden-order_iPhone_14_Pro.png |
| 11 | 店舗選択 | iPhone_14_Pro | UX-19: ボタン間スペース | 近すぎるボタンペア: 1 | aiden-order_iPhone_14_Pro.png |
| 12 | メニュー・カート | iPhone_14_Pro | UX-09: 画面読み込み正常 | title="焼肉 炭火亭 渋谷店 | Weir モバイルオーダー", content=false | aiden-order-store_iPhone_14_Pro.png |
| 13 | メニュー・カート | iPhone_14_Pro | UX-20: コンソールエラーなし | エラー1件: Failed to load resource: the server responded with a status of 400 () | aiden-order-store_iPhone_14_Pro.png |
| 14 | チェックアウト | iPhone_14_Pro | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: EN(42x44) | aiden-order-checkout_iPhone_14_Pro.png |
| 15 | チェックアウト | iPhone_14_Pro | UX-20: コンソールエラーなし | エラー2件: Failed to load resource: the server responded with a status of 400 () | aiden-order-checkout_iPhone_14_Pro.png |
| 16 | トラッキング | iPhone_14_Pro | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: 🏪(36x36), 🛵(40x40) | aiden-order-tracking_iPhone_14_Pro.png |
| 17 | ブランドHP | iPhone_14_Pro | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: ☰(39x48) | aiden-brand-sushiro_iPhone_14_Pro.png |
| 18 | 店舗選択 | Galaxy_S21 | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: (30x38), (30x38), (30x38), (30x38) | aiden-order_Galaxy_S21.png |
| 19 | 店舗選択 | Galaxy_S21 | UX-19: ボタン間スペース | 近すぎるボタンペア: 1 | aiden-order_Galaxy_S21.png |
| 20 | メニュー・カート | Galaxy_S21 | UX-09: 画面読み込み正常 | title="焼肉 炭火亭 渋谷店 | Weir モバイルオーダー", content=false | aiden-order-store_Galaxy_S21.png |
| 21 | メニュー・カート | Galaxy_S21 | UX-20: コンソールエラーなし | エラー1件: Failed to load resource: the server responded with a status of 400 () | aiden-order-store_Galaxy_S21.png |
| 22 | チェックアウト | Galaxy_S21 | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: EN(42x44) | aiden-order-checkout_Galaxy_S21.png |
| 23 | チェックアウト | Galaxy_S21 | UX-20: コンソールエラーなし | エラー2件: Failed to load resource: the server responded with a status of 400 () | aiden-order-checkout_Galaxy_S21.png |
| 24 | トラッキング | Galaxy_S21 | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: 🏪(36x36), 🛵(40x40) | aiden-order-tracking_Galaxy_S21.png |
| 25 | ブランドHP | Galaxy_S21 | UX-01: テキスト横はみ出し | scrollWidth=382, clientWidth=360 | aiden-brand-sushiro_Galaxy_S21.png |
| 26 | ブランドHP | Galaxy_S21 | UX-02: ボタンサイズ(44x44px以上) | 小さいボタン: ☰(39x48) | aiden-brand-sushiro_Galaxy_S21.png |

## 詳細結果

### 店舗選択 (aiden-order)

#### iPhone_SE (375x667)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=375, clientWidth=375 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: (30x38), (30x38), (30x38), (30x38) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素1個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="モバイルオーダー | 炭火亭", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=1, tel=4, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width,initial-scale=1,maximum-scale=1 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=manipulation |
| UX-19 | ボタン間スペース | **FAIL** | 近すぎるボタンペア: 1 |
| UX-20 | コンソールエラーなし | PASS | OK |

#### iPhone_14_Pro (393x852)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=393, clientWidth=393 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: (30x38), (30x38), (30x38), (30x38) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素1個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="モバイルオーダー | 炭火亭", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=1, tel=4, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width,initial-scale=1,maximum-scale=1 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=manipulation |
| UX-19 | ボタン間スペース | **FAIL** | 近すぎるボタンペア: 1 |
| UX-20 | コンソールエラーなし | PASS | OK |

#### Galaxy_S21 (360x800)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=360, clientWidth=360 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: (30x38), (30x38), (30x38), (30x38) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素1個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="モバイルオーダー | 炭火亭", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=1, tel=4, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width,initial-scale=1,maximum-scale=1 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=manipulation |
| UX-19 | ボタン間スペース | **FAIL** | 近すぎるボタンペア: 1 |
| UX-20 | コンソールエラーなし | PASS | OK |

### メニュー・カート (aiden-order-store)

#### iPhone_SE (375x667)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=375, clientWidth=375 |
| UX-02 | ボタンサイズ(44x44px以上) | PASS | OK |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | 入力フィールドなし |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素なし |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | **FAIL** | title="焼肉 炭火亭 渋谷店 | Weir モバイルオーダー", content=false |
| UX-10 | カート±ボタンサイズ | PASS | ボタン未検出 |
| UX-11 | input type適切 | PASS | email=0, tel=0, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | **FAIL** | エラー1件: Failed to load resource: the server responded with a status of 400 () |

#### iPhone_14_Pro (393x852)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=393, clientWidth=393 |
| UX-02 | ボタンサイズ(44x44px以上) | PASS | OK |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | 入力フィールドなし |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素なし |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | **FAIL** | title="焼肉 炭火亭 渋谷店 | Weir モバイルオーダー", content=false |
| UX-10 | カート±ボタンサイズ | PASS | ボタン未検出 |
| UX-11 | input type適切 | PASS | email=0, tel=0, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | **FAIL** | エラー1件: Failed to load resource: the server responded with a status of 400 () |

#### Galaxy_S21 (360x800)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=360, clientWidth=360 |
| UX-02 | ボタンサイズ(44x44px以上) | PASS | OK |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | 入力フィールドなし |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素なし |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | **FAIL** | title="焼肉 炭火亭 渋谷店 | Weir モバイルオーダー", content=false |
| UX-10 | カート±ボタンサイズ | PASS | ボタン未検出 |
| UX-11 | input type適切 | PASS | email=0, tel=0, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | **FAIL** | エラー1件: Failed to load resource: the server responded with a status of 400 () |

### チェックアウト (aiden-order-checkout)

#### iPhone_SE (375x667)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=375, clientWidth=375 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: EN(42x44) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素3個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="注文の最終確認 - 焼肉 炭火亭 渋谷店 | Weir", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=2, tel=1, number=1 |
| UX-12 | Stripe決済フォーム表示 | PASS | Stripe iframe検出 |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | **FAIL** | エラー2件: Failed to load resource: the server responded with a status of 400 () |

#### iPhone_14_Pro (393x852)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=393, clientWidth=393 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: EN(42x44) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素3個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="注文の最終確認 - 焼肉 炭火亭 渋谷店 | Weir", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=2, tel=1, number=1 |
| UX-12 | Stripe決済フォーム表示 | PASS | Stripe iframe検出 |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | **FAIL** | エラー2件: Failed to load resource: the server responded with a status of 400 () |

#### Galaxy_S21 (360x800)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=360, clientWidth=360 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: EN(42x44) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素3個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="注文の最終確認 - 焼肉 炭火亭 渋谷店 | Weir", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=2, tel=1, number=1 |
| UX-12 | Stripe決済フォーム表示 | PASS | Stripe iframe検出 |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | **FAIL** | エラー2件: Failed to load resource: the server responded with a status of 400 () |

### トラッキング (aiden-order-tracking)

#### iPhone_SE (375x667)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=375, clientWidth=375 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: 🏪(36x36), 🛵(40x40) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素2個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="注文状況 - 焼肉 炭火亭 渋谷店 | Weir", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=0, tel=0, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | プログレス要素検出 |
| UX-15 | チャットモーダル | PASS | チャットボタン検出 |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | PASS | OK |

#### iPhone_14_Pro (393x852)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=393, clientWidth=393 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: 🏪(36x36), 🛵(40x40) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素2個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="注文状況 - 焼肉 炭火亭 渋谷店 | Weir", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=0, tel=0, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | プログレス要素検出 |
| UX-15 | チャットモーダル | PASS | チャットボタン検出 |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | PASS | OK |

#### Galaxy_S21 (360x800)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=360, clientWidth=360 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: 🏪(36x36), 🛵(40x40) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素2個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="注文状況 - 焼肉 炭火亭 渋谷店 | Weir", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=0, tel=0, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 対象外ページ |
| UX-14 | カウントダウン表示 | PASS | プログレス要素検出 |
| UX-15 | チャットモーダル | PASS | チャットボタン検出 |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | PASS | OK |

### ブランドHP (aiden-brand-sushiro)

#### iPhone_SE (375x667)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | **FAIL** | scrollWidth=382, clientWidth=375 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: ☰(39x48), ⏸(44x44) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素2個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="焼肉 炭火亭 | うまい肉を、炭火で。", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=1, tel=1, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 予約ボタン検出（モーダル操作は後続テストで確認） |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | PASS | OK |

#### iPhone_14_Pro (393x852)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | PASS | scrollWidth=393, clientWidth=393 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: ☰(39x48) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素2個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="焼肉 炭火亭 | うまい肉を、炭火で。", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=1, tel=1, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 予約ボタン検出（モーダル操作は後続テストで確認） |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | PASS | OK |

#### Galaxy_S21 (360x800)
| ID | チェック項目 | 結果 | 詳細 |
|---|---|---|---|
| UX-01 | テキスト横はみ出し | **FAIL** | scrollWidth=382, clientWidth=360 |
| UX-02 | ボタンサイズ(44x44px以上) | **FAIL** | 小さいボタン: ☰(39x48) |
| UX-03 | 画像レスポンシブ | PASS | OK |
| UX-04 | モーダルスクロール | PASS | モーダルなし |
| UX-05 | フォームfont-size≥16px | PASS | OK |
| UX-06 | ヘッダー/フッター重なり | PASS | 固定要素2個（目視確認推奨） |
| UX-07 | カテゴリタブ横スクロール | PASS | タブなし |
| UX-08 | 価格全桁表示 | PASS | OK |
| UX-09 | 画面読み込み正常 | PASS | title="焼肉 炭火亭 | うまい肉を、炭火で。", content=true |
| UX-10 | カート±ボタンサイズ | PASS | 対象外ページ |
| UX-11 | input type適切 | PASS | email=1, tel=1, number=0 |
| UX-12 | Stripe決済フォーム | PASS | 対象外ページ |
| UX-13 | 予約モーダル | PASS | 予約ボタン検出（モーダル操作は後続テストで確認） |
| UX-14 | カウントダウン表示 | PASS | 対象外ページ |
| UX-15 | チャットモーダル | PASS | チャット機能なし |
| UX-16 | viewport meta設定 | PASS | width=device-width, initial-scale=1.0 |
| UX-17 | スワイプ遷移防止 | PASS | overscroll-behavior: x=auto, y=auto |
| UX-18 | touch-action設定 | PASS | body=manipulation, html=auto |
| UX-19 | ボタン間スペース | PASS | OK |
| UX-20 | コンソールエラーなし | PASS | OK |

## UX改善提案（FAILではないが改善推奨）
| # | ページ | 提案内容 |
|---|---|---|
