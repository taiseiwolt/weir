# HTML / CSS フロントエンド規約

## ファイル命名
- `aiden-{機能名}.html`

## display_id
- 形式: prefix + 7桁英数字（例: STR-a1b2c3d）

## UI パターン
- モーダル: backdrop付き、ESCキーで閉じる、既存パターンに合わせる
- フォームバリデーション: フロント側でも実施する
- 画面遷移: URLパラメータで store_id, brand_id 等を引き渡す

## バージョニング
- dot notation（例: v33.8）
- 変更のたびにバージョンを上げる
- versioned ファイル + versionless ファイルの2つを出力する
