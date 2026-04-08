# 監視・保守テスター（Monitoring & Maintenance Tester）セキュリティテストレポート

**実行日**: 2026-04-08
**対象リポジトリ**: github.com/taiseiwolt/aiden-demo + github.com/taiseiwolt/aiden-pos
**対象コミット**: dfc961121447fdd0c593b6f269cead14e20df1a2

## サマリ
- チェック項目数: 35
- 問題なし: 15
- 要改善（P2/P3）: 6
- 脆弱性あり（P0/P1）: 8

---

## 成熟度レベル自己評価

**現在レベル: 1.5（基本ログ + 部分的カバレッジ）**

根拠:
- 監査ログは存在し、一部の重要操作をカバー（注文ステータス、チャージバック、不正警告、匿名化）
- しかし: 返金、管理者ログイン、キャンセルのカバレッジ欠落
- しかし: audit_logsの改ざん防止なし
- しかし: 外部エラー監視サービス（Sentry等）なし
- しかし: バックアップ・リカバリ手順の文書化なし
- しかし: 6つのセキュリティヘッダーのうち5つが未設定

Level 2到達に必要: エラー監視サービス導入 + 監査ログカバレッジ完全化
Level 3到達に必要: バックアップ文書化 + 定期セキュリティ監査スケジュール + 依存関係スキャン

---

## 監査ログカバレッジマトリクス

| 操作 | 記録有無 | 場所 | 備考 |
|------|---------|------|------|
| 注文ステータス変更 | YES | api/orders/[...path].js:651 | action: order_status_change |
| チャージバック | YES | api/payments/webhook.js:136 | action: chargeback_dispute_created |
| 不正警告 | YES | api/payments/webhook.js:184 | action: radar_fraud_warning |
| メール認証再送 | YES | api/members/[...path].js:812 | action: email_verification_resent |
| 一括インポート | YES | api/bulk-import/[...path].js:455 | writeAuditLog helper |
| アカウント匿名化 | YES | 20260323400000_withdrawal_anonymization.sql:84 | action: account_anonymized |
| チャットログクリーンアップ | YES | 20260324000000_ai_chat_support.sql:316 | action: chat_log_cleanup |
| 補償操作 | YES | aiden-admin.html:1932 | writeAuditLog function |
| 管理エンティティCRUD | YES | aiden-admin.html:245 | logAudit function |
| **返金実行** | **NO** | stripe-create-refund/index.ts | **P0** |
| **注文キャンセル** | **NO** | api/orders/[...path].js:570-593 | **P1** |
| **管理者ログイン** | **NO** | N/A | **P1** |
| **権限・ロール変更** | **NO** | N/A | **P1** |
| **加盟店情報変更** | **NO** | N/A | 未実装 |
| **アカウント作成** | **NO** | N/A | 未記録 |

---

## 発見事項

### P0/P1（即時対応）

#### P0-1: audit_logsの改ざんが可能
- **対象**: audit_logsテーブル
- **内容**: DELETE/UPDATE制限なし。service_roleキーが侵害された場合、監査証跡全体の消去が可能。既存のaudit_logエントリの変更を防止するトリガーなし。
- **再現手順**: service_role keyでDELETE FROM audit_logs実行
- **影響**: 全監査証跡の消失、不正行為の痕跡消去
- **修正方針**: `BEFORE UPDATE OR DELETE ON audit_logs`トリガーでRAISE EXCEPTION。または追記専用（INSERT only）のRLSポリシーに分割。
- **フェーズ影響**: Phase 1

#### P0-2: 返金操作がaudit_logに記録されない
- **対象**: `supabase/functions/stripe-create-refund/index.ts`
- **内容**: 返金はordersテーブルの`refunded_by`フィールドのみに記録。audit_logsへの書き込みなし。金融コンプライアンス上の重大な欠陥。
- **修正方針**: 返金実行後にaudit_logsへ書き込みを追加（action: 'refund_executed', 金額、理由、実行者を含む）
- **フェーズ影響**: Phase 1

#### P1-1: 5つのセキュリティヘッダーが未設定
- **対象**: `vercel.json`
- **内容**: CSPのみ設定済み。以下が未設定:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **影響**: クリックジャッキング、MIMEスニッフィング、HTTPS未強制、Referrer漏洩
- **修正方針**: vercel.jsonのheadersセクションに追加
- **フェーズ影響**: Phase 1

#### P1-2: 外部エラー監視サービスなし
- **対象**: プロジェクト全体
- **内容**: Sentry、Datadog、LogRocket等の外部エラー監視なし。エラーはVercelの一時的なログでのみ確認可能（アラートなし、集計なし）。
- **修正方針**: Sentry（無料枠あり）の導入を推奨
- **フェーズ影響**: Phase 1

#### P1-3: 管理者ログインイベントが記録されない
- **対象**: 管理画面全体
- **内容**: 管理パネルへのアクセスやログインイベントの記録なし
- **修正方針**: 管理画面ログイン時にaudit_logsに記録
- **フェーズ影響**: Phase 1

#### P1-4: 注文キャンセル・返金がAPI経由でaudit_log未記録
- **対象**: `api/orders/[...path].js` lines 570-593
- **内容**: キャンセルハンドラーがStripeキャンセル/返金を実行するが監査ログなし
- **修正方針**: audit_logsへの書き込みを追加
- **フェーズ影響**: Phase 1

#### P1-5: バックアップ・リカバリ手順の文書化なし
- **対象**: プロジェクト全体
- **内容**: DRランブック、PITR設定の確認、復元テストの証跡なし
- **修正方針**: バックアップ・リカバリ手順を文書化し、定期的に復元テストを実施
- **フェーズ影響**: Phase 1

#### P1-6: ゲスト注文PIIが無期限保持
- **対象**: ordersテーブル
- **内容**: ゲストのcustomer_name, customer_email, customer_phoneが保持期間なしで永久保存。日本APPI/GDPR準拠のため保持期間の定義が必要。
- **修正方針**: 保持期間（例: 注文完了後1年）を定義し、自動匿名化のpg_cronジョブを設定
- **フェーズ影響**: Phase 1

---

### P2/P3（計画的対応）

#### P2-1: 管理画面のaudit_loggerにハードコードメール
- **対象**: `aiden-admin.html` line 246
- **内容**: `user_email:'taisei@sumbibi.com'`がハードコード。全管理操作が同一メールで記録される。
- **修正方針**: `getCurrentUserEmail()`で動的取得（aiden-customer-admin.htmlでは既に実装済み）
- **フェーズ影響**: Phase 1

#### P2-2: 加盟店退出・オフボーディングプロセスなし
- **対象**: プロジェクト全体
- **内容**: 加盟店解約時のデータエクスポート、削除タイムライン、Stripe Connect切断、ストレージクリーンアップの手順が未定義
- **フェーズ影響**: Phase 2

#### P2-3: npm audit / 依存関係脆弱性スキャンなし
- **対象**: package.json
- **内容**: ただし本番依存は4パッケージのみ（@anthropic-ai/sdk, @supabase/supabase-js, openai, stripe）でリスクは限定的
- **フェーズ影響**: Phase 1

#### P2-4: CSPがunsafe-inlineを許可
- **対象**: vercel.json
- **内容**: script-srcとstyle-srcの両方で'unsafe-inline'を許可。現行アーキテクチャ（ビルドシステムなし、インラインスクリプト）の制約。
- **フェーズ影響**: Phase 2以降

#### P3-1: 25ページ中1ページのみがグローバルエラーハンドラーを持つ
- **対象**: aiden-customer-admin.htmlのみunhandledrejectionハンドラーあり
- **フェーズ影響**: Phase 2

#### P3-2: 監査ログのローテーション・アーカイブ戦略なし
- **内容**: データ増加に伴い問題化する可能性
- **フェーズ影響**: Phase 3

---

### 問題なし
- audit_logsテーブル存在、RLS（service_role only）
- audit_logsタイムスタンプ: TIMESTAMPTZ（UTC）
- エンドユーザー退会匿名化: SHA256ハッシュ、PII無効化、auth.users削除
- customer_id NULL化: ON DELETE SET NULL + 明示的関数
- チャットログ180日保持: pg_cronで週次クリーンアップ
- 孤立注文クリーンアップ: pg_cron
- 未検証アカウントクリーンアップ: service_role限定
- .envファイル: .gitignoreに含む
- package-lock.json: 存在（再現可能なビルド）
- SSL: Vercel自動管理
- チャージバック・不正警告メール: 実装済み
