# Chrome Visual QA Results - R3
- Date: 2026-03-23
- Tester: chrome-visual
- Target: https://weir.co.jp

## Summary
- Total: 12 items
- PASS: 12
- FAIL: 0
- NOTE: 1 (non-blocking visual issue)

---

## A. 注文E2Eフロー（画面表示確認）

### A-01: MO画面メニュー表示
- **Result: PASS**
- URL: https://weir.co.jp/aiden-order-store.html?store_id=aaaa3333-0000-0000-0000-000000000002
- Store name "新宿店" displayed correctly
- 5 category tabs: 焼肉セット, 単品焼肉, サイドメニュー, ドリンク, デザート
- Menu items show name, description, price, + button
- Search bar present
- Header: brand icon, address input, cart (注文を見る ¥0), サインイン
- **NOTE**: All menu item images show broken/placeholder icons (question marks). Non-blocking but affects visual quality.

### A-04: トラッキング画面構造
- **Result: PASS**
- URL: https://weir.co.jp/aiden-order-tracking.html
- Map displayed (Leaflet/OpenStreetMap) with delivery route
- Rider icon and store icon on map
- Circular progress indicator: "10分 でお届け"
- Store name: "焼肉 炭火亭 渋谷店"
- Status: "調理が完了しました"
- Progress dots: 4/7 filled (green)
- Estimated delivery time note displayed
- Chat and receipt buttons at bottom

### A-05: 受注ダッシュボード表示
- **Result: PASS**
- URL: https://weir.co.jp/aiden-order-dashboard.html
- Left sidebar: Weir logo, 注文 (badge 3), 売上, メニュー, 設定, notification bell
- Header: store name "焼肉 炭火亭 渋谷店", 接続中 indicator, notification badge (3), 受付中 toggle
- Status tabs: すべて 0 / 新規 0 / 調理中 0 / 受け渡し待ち 0 / 受渡済 0 / 取消 0
- Two order sections: 店内注文 0件 / 店外注文（テイクアウト・デリバリー）0件
- Table columns: 状態, 番号, 種別, 媒体, 注文内容, 時間, 合計
- Empty state messages displayed correctly

### A-14: マイページ構造
- **Result: PASS**
- URL: https://weir.co.jp/aiden-mypage.html
- Header: "マイページ" with back arrow (red bar)
- User avatar icon (generic profile silhouette)
- "ログインしてください" heading
- "マイページを利用するにはログインが必要です。" explanation
- "ログイン / 会員登録" button (red, prominent)
- "パスワードをお忘れですか？" link (underlined)

---

## B. データ連携（表示反映確認）

### B-01: メニュー名表示
- **Result: PASS**
- All menu item names display correctly in Japanese
- Examples: 特選カルビセット, ファミリーセット, 上カルビ, ハラミ, タン塩, ロース, ナムル盛り合わせ, チョレギサラダ, 石焼ビビンバ, 生ビール, ソフトドリンク, バニラアイス

### B-02: メニュー価格表示
- **Result: PASS**
- All prices displayed with yen symbol
- Examples: ¥1,980, ¥5,980, ¥1,280, ¥980, ¥1,180, ¥880, ¥480, ¥580, ¥980, ¥550, ¥280, ¥380
- Price formatting consistent (¥ + comma-separated digits)

### B-05: 営業時間表示
- **Result: PASS**
- Main page shows "明日の11:00に開店" with clock icon
- Store details modal shows full weekly schedule:
  - 日曜日: 11:00-21:00
  - 月曜日: 11:00-22:00
  - 火曜日: 11:00-22:00
  - 水曜日: 11:00-22:00
  - 木曜日: 11:00-22:00
  - 金曜日: 11:00-23:00
  - 土曜日: 11:00-23:00

### B-06: 店舗情報表示
- **Result: PASS**
- Store name: 新宿店
- Status: 閉店中 (red dot)
- Address: 東京都新宿1-27-3, 150-0043
- Map: Leaflet map with pin marker
- "地図を見る" link
- 配達情報 section also present
- Delivery info: 配達料金 ¥400, 30-50分でお届け予定

---

## D. 問い合わせフッター

### D-05: MO画面フッター
- **Result: PASS**
- 利用規約 link
- プライバシーポリシー link
- お問い合わせ: support@weir.co.jp
- Powered by Weir

### D-06: ダッシュボードフッター
- **Result: PASS**
- お問い合わせ: support@weir.co.jp (clickable link)
- 緊急時: 管理者に直接ご連絡ください
- Powered by Weir

### D-07: 管理マスタフッター
- **Result: PASS**
- お問い合わせ: support@weir.co.jp (clickable link)
- 緊急時: 管理者に直接ご連絡ください
- Powered by Weir

### D-08: ブランドHPフッター
- **Result: PASS**
- Brand logo + description
- Menu links: グランドメニュー, 焼肉・特選肉, ご飯・麺, ドリンク, コース・プラン
- Service links: 来店予約, お持ち帰り, デリバリー, 会員プログラム
- Company info section
- News section (ニュース一覧)
- SNS buttons: LINE, X, Instagram
- Bottom bar: copyright (2026 炭火亭), プライバシーポリシー, 利用規約, 返金ポリシー, サイトマップ, お問い合わせ
- Powered by Weir

---

## Notes

### Non-blocking Issue
- **Menu item images broken**: All product images on MO page (aiden-order-store.html) display as broken placeholder icons (gray question mark boxes). This affects visual presentation but does not block ordering functionality. Likely a Supabase Storage URL or image path issue.
