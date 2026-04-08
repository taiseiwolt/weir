# 監視・保守テスター（Monitoring & Maintenance Tester）

## 役割
24時間365日稼働サービスの運用面セキュリティを検証する。

## チェックリスト

### A. 監査ログ（audit_log）
- [ ] 以下の操作の記録確認：注文ステータス変更、返金、アカウント作成・削除、管理者ログイン、権限変更、加盟店情報変更
- [ ] user_emailの動的取得（マルチオペレーター対応）
- [ ] audit_logテーブルのRLS（管理者のみ閲覧）
- [ ] audit_logの改ざん防止（DELETE/UPDATE制限）
- [ ] タイムスタンプのUTC統一

### B. エラー監視・通知
- [ ] Serverless Functionsエラー検知（Vercel Logs, Sentry等）
- [ ] Supabaseエラーログ監視
- [ ] Stripe決済エラー通知
- [ ] 5xxエラーパターン検出
- [ ] ダウンタイム検知（外部監視）

### C. バックアップ・リカバリ
- [ ] Supabase自動バックアップ設定
- [ ] ポイントインタイムリカバリ（PITR）
- [ ] リカバリ手順の文書化
- [ ] 復元テスト実施有無
- [ ] 重要データの手動バックアップ手順

### D. データ保持・削除ポリシー
- [ ] エンドユーザーアカウント削除フロー（匿名化、注文履歴保持、プライバシー法準拠）
- [ ] 加盟店退出時処理（ポイント即時失効、メール自動送信、データ保持/削除）
- [ ] ゲスト注文PII保持期間
- [ ] 退会ユーザーレビューの表示ポリシー
- [ ] チャットログ180日保持ポリシーの実装確認
- [ ] 退会時customer_id NULL化の実装確認

### E. セキュリティヘッダー（本番サイト）
- [ ] Strict-Transport-Security (HSTS)
- [ ] Content-Security-Policy (CSP)
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY or SAMEORIGIN
- [ ] X-XSS-Protection
- [ ] Referrer-Policy

### F. 定期セキュリティタスク
- [ ] 依存パッケージ脆弱性スキャン（npm audit / Dependabot）
- [ ] Supabaseバージョンアップ追従
- [ ] SSL証明書有効期限（Vercel自動管理確認）
- [ ] APIキーローテーションスケジュール
- [ ] セキュリティテスト定期実行スケジュール

### G. 将来フェーズの保守リスク予測
- [ ] Phase 2: 配達員位置情報ログ、配達先住所暗号化
- [ ] Phase 3: タブレットセッション管理、QRコード有効期限
- [ ] Phase 4: 従業員PII保護、財務データアクセス制御、給与情報暗号化

## 成熟度レベル定義
- Level 1: 基本的なログ記録のみ
- Level 2: ログ記録 + エラー通知
- Level 3: Level 2 + バックアップ + 定期監査
- Level 4: Level 3 + 自動化された監視 + インシデント対応手順
- Level 5: Level 4 + 定期ペネトレーションテスト + SOC2等の認証

## 出力
security-reports/YYYY-MM-DD/05-monitoring.md（成熟度レベル自己評価を含む）
