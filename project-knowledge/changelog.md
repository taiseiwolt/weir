# Project Knowledge Changelog

## 2026-03-24: 初回生成 + 4部門エージェント新規作成

### 新規作成されたエージェント定義

#### Engineering（6エージェント）
- **_engineering-director** — 開発全般の品質管理・技術方針統括
- **frontend-builder** — HTML/JS/CSS フロントエンド開発
- **supabase-architect** — DB設計・マイグレーション・RLS・Edge Functions
- **api-developer** — Vercel Serverless / Supabase Edge Functions API開発
- **stripe-integrator** — Stripe Connect決済実装・保守
- **security-auditor** — XSS/SQLi/RLS等セキュリティ監査

#### Business（4エージェント）
- **_business-director** — プロダクト企画・ビジネス戦略統括
- **product-manager** — 仕様策定・機能設計・CC依頼文作成
- **pricing-strategist** — 料金体系・手数料・請求設計
- **merchant-success** — 加盟店オンボーディング・運用支援

#### Operations（4エージェント）
- **_operations-director** — QA・デプロイ・監視・サポート統括
- **qa-lead** — QAテスト計画・実行・チーム調整
- **deployment-manager** — Vercel/Supabaseデプロイ・インフラ管理
- **support-coordinator** — サポートチケット・エスカレーション管理

#### Corporate（4エージェント）
- **_corporate-director** — 財務・データ分析・経営管理統括
- **finance-manager** — 請求・決済管理・会計処理
- **data-analyst** — データ分析・KPIトラッキング
- **fee-reconciler** — 手数料・決済照合処理

#### Legal（既存・4エージェント）
- **_legal-director** — 法務文書品質管理・最終承認
- **contract-drafter** — 契約書・覚書・特約の起草
- **compliance-checker** — 法令準拠チェック
- **privacy-officer** — 個人情報保護・プライバシー監督

### CLAUDE.md で直近反映済みのルール

1. **法務文書ガードレール** — 曖昧表現チェック（「原則」「速やかに」等9パターン）の必須実行、Weirリスクチェック、外部弁護士確認推奨コメント付記
2. **エージェント横断の品質チェック** — 法務・決済・セキュリティ・UI/UX・データ設計の5領域で横断チェック
3. **PII取扱いルール強化** — ゲストPII非共有、チャットログ180日保持、退会時NULL化、エスカレーション時は要約のみ
4. **XSS対策の明文化** — escH() による全DB/APIデータのエスケープ必須化
5. **QA Teamの構成定義** — 5チームメイト（auto-tester, chrome-visual, chrome-destructive, db-verifier, critical-observer）の役割・通信ルール
6. **Edge Functions追加** — send-withdrawal-email, send-escalation-email, monitor-usage, collect-competitor-data 等の新規関数
7. **¥50,000注文上限** — checkout/confirm-orderでの金額制限実装
