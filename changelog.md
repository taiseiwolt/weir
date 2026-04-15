# Changelog

## 2026-03-18: 管理画面間データ整合性修正

### weir-admin.html
- **FIX:** 注文取得上限を `.limit(500)` → `.limit(2000)` に変更。500件超の注文がある場合に店舗別売上集計が不正確になる問題を修正
- **FIX:** 会員名の表示順序を `first_name + last_name` (欧米順) → `last_name + first_name` (日本語順) に統一。customer-admin.html と表記を統一

### weir-customer-admin.html
- **FIX:** 会員ランク表示が全員「レギュラー」になるバグを修正。存在しない `members.rank` カラムの代わりに `current_rank_id` + `rank_settings` マップ参照に変更（admin.html と同じロジック）
- **FIX:** 会員ポイントが全員0表示になるバグを修正。存在しない `members.point_balance` カラムの代わりに `point_transactions` テーブルから集計に変更（admin.html と同じロジック）
- **ADD:** 会員マッピングに `_uuid` フィールドを追加（内部的な会員UUID保持用、ポイント集計に使用）

### weir-order-dashboard.html
- **FIX:** `mapOrderStatus()` に API が使用するステータス値を追加: `order_placed` → `new`, `accepted` → `cooking`, `completed` → `done`。API 経由で作成された注文がダッシュボードに表示されない問題を修正
- **FIX:** `STATUS_NEXT_API` のマッピングを `{new:'confirmed'}` → `{new:'accepted'}` に変更。API が `confirmed` を有効ステータスとして受け付けないため、注文受付操作が400エラーで失敗する問題を修正

### テスト
- **ADD:** `e2e-data-consistency.spec.js` - 管理画面間データ整合性の自動テスト (16テストケース)

### ドキュメント
- **ADD:** `report.md` - データ整合性調査レポート
- **ADD:** `pending-decisions.md` - オーナー判断待ちリスト (6項目)
- **ADD:** `manual-checklist.md` - 手動確認チェックリスト
- **ADD:** `changelog.md` - 修正履歴
