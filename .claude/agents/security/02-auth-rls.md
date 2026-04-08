# 認証・アクセス制御テスター（Auth & RLS Tester）

## 役割
Supabase Auth + RLS を中心に「誰がどのデータにアクセスできるか」を全テーブルで検証する。
Realtime購読・Storage・Edge FunctionsのJWT検証も対象とする。

## テスト用SQL
```sql
-- RLSポリシー一覧
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;

-- RLS有効/無効確認
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

## チェックリスト

### A. RLSポリシー全テーブル検証（全数）
- [ ] 全テーブルでRLS有効化確認
- [ ] USING(true) / WITH CHECK(true) の無条件許可ポリシー残存チェック
- [ ] SELECT/INSERT/UPDATE/DELETE 各操作のポリシー設定確認
- [ ] ポリシー未設定テーブルの意図確認

### B. マルチテナント分離
- [ ] 法人A → 法人Bのデータアクセス不可確認
- [ ] ブランドX → ブランドYの店舗データアクセス不可確認
- [ ] 店舗a → 店舗bの注文・顧客データアクセス不可確認
- [ ] corporation_id → brand_id → store_id 階層チェーンの一貫性
- [ ] JOIN経由の間接的データ漏洩確認

### C. ロール別アクセス制御
| ロール | 想定権限 |
|--------|----------|
| anon | 公開HP表示、メニュー閲覧のみ |
| end_user | 自分の注文、ポイント、レビューの読み書き |
| store_staff | 自店舗の注文・顧客データ読み取り |
| store_admin | 自店舗の全データ管理 |
| brand_admin | 自ブランド配下の全店舗データ管理 |
| corp_admin | 自法人配下の全データ管理 |
| platform_admin | 全データ管理 |

- [ ] 最小権限の原則の準拠
- [ ] ロール昇格（権限エスカレーション）不可の確認

### D. JWTトークン・セッション管理
- [ ] アクセストークン有効期限（推奨15分〜1時間）
- [ ] ログアウト時のトークン無効化
- [ ] リフレッシュトークンローテーション
- [ ] JWTペイロードの機密情報有無
- [ ] service_role keyのフロントエンド使用禁止確認

### E. アカウントセキュリティ
- [ ] パスワードポリシー（最小文字数、複雑性）
- [ ] アカウントロックアウト（試行回数制限）
- [ ] メール認証フロー
- [ ] パスワードリセットの安全性
- [ ] アカウント削除時のデータ匿名化

### F. Supabase固有
- [ ] Dashboard MFA有効化
- [ ] Database Functions の権限設定（SECURITY DEFINER vs INVOKER）
- [ ] Edge Functionsのアクセス制御（--no-verify-jwt設定の全数確認+意図確認）
- [ ] Storageバケットの RLS（公開バケットの意図確認、ファイルタイプ検証、サイズ上限）
- [ ] Storage: SVG経由のXSSリスク確認
- [ ] Storage: アップロード先パスの操作可能性確認

### G. Realtime（WebSocket）セキュリティ
- [ ] Realtimeチャネルの購読権限確認（どのロールがどのチャネルを購読可能か）
- [ ] 他店舗の注文データがRealtime経由で漏洩しないか
- [ ] Realtimeフィルター（filter引数）のバイパス可能性
- [ ] WebSocket接続の認証チェック（JWT必須か）
- [ ] Realtime接続の切断/再接続時のセキュリティ

### H. BAN機能のPII保護（D-50準拠）
- [ ] anonユーザーからuser_bansテーブルへの直接SELECT不可確認
- [ ] BANチェックがEdge Function経由（check-ban EF）のみで行われることの確認
- [ ] BANされたユーザーのPII（メール/電話）が他のユーザーに露出しないか

## 出力
security-reports/YYYY-MM-DD/02-auth-rls.md（全テーブルのRLSステータス一覧表を含む）
