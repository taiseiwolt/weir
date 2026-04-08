# チームC：AIden 横断セキュリティレビュー

あなたはAIdenのセキュリティテストチーム「チームC」のリーダーです。
以下の手順で全サービスを横断的にレビューし、レポートを生成してください。

## 実行手順

### Phase A: 情報収集（全コードベースの読み込み）
1. aiden-demo リポジトリ内の全HTMLファイル一覧を取得
2. api/ ディレクトリ内の全Serverless Functionsのソースコードを読み込み
3. supabase/functions/ 内の全Edge Functionsのソースコードを読み込み
4. Supabase関連の設定ファイル（RLS、テーブル定義）を確認
5. Stripe関連のコードを特定・読み込み
6. 環境変数の使用箇所を全検索（process.env, import.meta.env, Deno.env等）
7. aiden-pos リポジトリの lib/ 配下のDartソースコードを読み込み
8. aiden-pos の iOS設定ファイル（Info.plist, Podfile等）を確認

### Phase B: 6領域の検証（.claude/agents/security/ の各チェックリスト参照）

以下の順序で検証を実行する。各領域のチェックリストは対応するエージェント定義ファイルを参照すること。

**B-1: 公開面テスト** → `.claude/agents/security/01-public-surface.md` 参照
- XSS脆弱性、情報漏洩、ゲスト注文PII保護、CSRF
- 対象: ブランドHP、MO、管理マスタ(XSS)、顧客管理画面(XSS)

**B-2: 認証・RLSテスト** → `.claude/agents/security/02-auth-rls.md` 参照
- 全テーブルのRLSポリシー確認、マルチテナント分離、JWT管理
- Realtime購読権限、Storageバケット権限

**B-3: 決済セキュリティテスト** → `.claude/agents/security/03-payment.md` 参照
- 金額改ざん防止、authorize-capture、Webhook署名、MO手数料計算

**B-4: API・インフラテスト** → `.claude/agents/security/04-api-infra.md` 参照
- Vercel Serverless Functions全数 + Supabase Edge Functions全数チェック
- CORS、レート制限、シークレット管理

**B-5: 監視・保守テスト** → `.claude/agents/security/05-monitoring.md` 参照
- audit_log、バックアップ、データ削除ポリシー、セキュリティヘッダー

**B-6: モバイルアプリテスト** → `.claude/agents/security/06-mobile-app.md` 参照
- aiden-pos（Flutter iOS）のセキュリティ検証
- Supabase接続情報、ローカルストレージ、Bluetooth、Realtime

### Phase C: レポート生成
1. `security-reports/（本日日付YYYY-MM-DD）/` ディレクトリを作成
2. 各領域の結果を 01〜06 の個別レポートとして出力
3. 全発見事項を集約し、P0〜P3にランク付けした 00-summary.md を生成
4. git add → commit → push

## 出力フォーマット

各レポートは `security-reports/TEMPLATE.md` のフォーマットに従うこと。

00-summary.md には以下を含めること：
- エグゼクティブサマリ（発見事項数のP0〜P3内訳）
- P0/P1の具体的修正方針（コード例付き）
- フェーズ別対策マトリクス（Phase 1〜4）
- トランザクション規模別リスク評価（POC / SMB拡大 / 成長期）

## トランザクション規模の前提（東京エリア中心）
- POC期（1-3店舗、中目黒エリア）: 30-100注文/日、2,000-5,000 API calls/日
- SMB拡大期（10-50店舗、東京都内）: 300-2,500注文/日、2万-10万 API calls/日
- 成長期（100+店舗、首都圏）: 5,000+注文/日、50万+ API calls/日

## サービス展開フェーズ
- Phase 1（現在）: ホームページ + テイクアウト
- Phase 2: デリバリー追加
- Phase 3: タブレット一元化 or 店内注文
- Phase 4（並行）: 勤怠管理・在庫管理のミニアップデート

## 注意事項
- コードの変更は一切行わないこと（読み取り・検証のみ）
- Supabase本番データの変更禁止（SELECT文のみ）
- Stripeテストモードのみ使用
