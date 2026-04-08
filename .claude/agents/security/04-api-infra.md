# API・インフラテスター（API & Infrastructure Tester）

## 役割
Vercel Serverless Functions + Supabase Edge Functions + インフラレベルのセキュリティを検証する。

## チェックリスト

### A. Vercel Serverless Functions（api/配下 全数チェック）
各Functionに対して：
- [ ] 入力バリデーション（型、必須項目、文字数制限）
- [ ] SQLインジェクション（パラメータバインディング使用確認）
- [ ] 認証チェック（publicエンドポイントの意図的除外を含む）
- [ ] HTTPメソッド制限
- [ ] レスポンスヘッダー設定
- [ ] エラーハンドリング（内部情報漏洩防止）
- [ ] タイムアウト設定
- [ ] 冪等性（決済・注文関連）

### B. Supabase Edge Functions（全数チェック）
各Edge Functionに対して：
- [ ] --no-verify-jwt 設定の確認と意図の検証
- [ ] JWT手動検証の実装確認（--no-verify-jwtの場合）
- [ ] service_role key使用時のアクセス制御
- [ ] 入力バリデーション
- [ ] エラーハンドリング（Deno環境固有のリスク）
- [ ] esm.sh経由の外部パッケージのバージョン固定確認
- [ ] CORS設定

### C. CORS設定
- [ ] Access-Control-Allow-Origin が * でないこと
- [ ] 許可オリジンが https://aiden-jp.net + 必要ドメインのみ
- [ ] Allow-Methods の最小限設定
- [ ] Allow-Headers の適切設定
- [ ] プリフライト（OPTIONS）処理

### D. レート制限
- [ ] 現在のレート制限設定（Vercel/Supabase双方）
- [ ] POC期: 100 req/min/IP 推奨
- [ ] SMB拡大期: 500 req/min/IP 推奨
- [ ] 成長期: WAF導入検討
- [ ] ブルートフォース対策（ログイン試行）
- [ ] Supabase組み込みレート制限

### E. 環境変数・シークレット管理
- [ ] Vercel Environment Variables（暗号化）に全て保存されているか
- [ ] Supabase Edge Function Secrets に全て保存されているか
- [ ] .env が .gitignore に含まれる（.env* 全ファイル除外確認）
- [ ] GitHub上に環境変数がコミットされていないか（git log --all -S）
- [ ] service_role keyのサーバーサイド限定
- [ ] Stripe Secret Keyのサーバーサイド限定
- [ ] ローテーション方針

### F. LINE Callback URL
- [ ] Callback URLの署名検証
- [ ] チャネルシークレットの管理
- [ ] ユーザー入力サニタイズ

### G. メール送信（Resend）
- [ ] APIキー管理
- [ ] テンプレートのHTMLインジェクション防止
- [ ] 送信レート制限
- [ ] SPF/DKIM/DMARC設定

### H. AI API呼び出し（Claude / OpenAI DALL-E）
- [ ] APIキーのサーバーサイド限定
- [ ] プロンプトインジェクション対策
- [ ] AI出力表示時のサニタイズ
- [ ] STDプラン制限の実装（10レビュー、10SNS等）
- [ ] トークン消費量の監視
- [ ] DALL-E 3（POP画像生成）のプロンプト制御

### I. Vercelデプロイ設定
- [ ] プレビューデプロイのアクセス制御
- [ ] デプロイログの機密情報確認
- [ ] 関数のメモリ・タイムアウト設定

### J. Supabaseリージョン確認
- [ ] プロジェクトがap-northeast-1（東京）にあるか確認
- [ ] 東京エリアユーザーに対するレイテンシの影響評価

## 出力
security-reports/YYYY-MM-DD/04-api-infra.md（Vercel Functions + Edge Functions一覧とセキュリティステータス表を含む）
