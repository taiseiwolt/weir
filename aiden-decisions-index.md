# Weir 決定事項インデックス

> 詳細は `.claude/decisions/` フォルダ内の各ファイルを参照
> **このファイルがProject Knowledgeにアップロードされる唯一のdecisionsファイル**
> 最終更新: 2026-04-14
>
> **【Claudeの必須ルール】このファイルを更新した場合、Claudeは必ず以下を実行すること:**
> **① ローカルファイル（`/Users/taisei/Desktop/aiden-demo/aiden-decisions-index.md`）を更新する**
> **② チャット内でTaiseiがDLできるファイル形式（present_files）で提出する**
> **ローカル更新とファイル提出なしのPKアップロード依頼は禁止。**

---

## タスク優先度

### P0: POCブロッカー（8件中7件完了）
- P0-1 [project] ✅ Stripe決済停止の解消 完了(2026-03-30)
- P0-2 [project] ✅ 特商法電話番号確認 完了(2026-03-28)
- P0-3 [project] ✅ 来店予約マイグレーションSQL実行 完了(2026-03-27)
- P0-4 [project] ✅ 来店予約EF 5本デプロイ 完了(2026-03-27)
- P0-5 [project] ✅ トラッキング画面根本修正 完了(2026-03-28)
- P0-6 [project] ✅ 日次自動ジョブPATH修正 完了(2026-03-28)
- P0-7 [project] 🔄 店舗候補への声かけ — Taisei単独対応中（居酒屋潮）
- P0-8 [project] ✅ テスト注文2件の返金 完了(2026-03-27)

### P1: POC開始前推奨（8件中6件完了）
- P1-1 [project] ✅ 予約注文トラッキング（パターンB）完了(2026-03-29)
- P1-2 [project] ✅ E2Eテスト116項目全PASS 完了(2026-03-30)
- P1-2a [project] ✅ モバイルUIUXテスト 完了(2026-03-30) 274/300 PASS
- P1-3 [project] ⏳ 法務ドキュメント施行日記入 — POC開始日に合わせて（P0-7依存）
- P1-4 [project] ✅ オンボーディング台本設計 完了(2026-03-27)
- P1-5 [project] ✅ AI品質Phase 1詳細設計 完了(2026-03-27)
- P1-6 [project] ⏳ 店舗決定後 — 事業者契約書v2締結（P0-7依存）
- P1-7 [project] 🔄 受注アプリ開発中(2026-03-31着手) テスト37/37 PASS・ウォークイン実機確認待ち

---

## ビジネス方針（B-01〜B-08）
- B-01 [user] 本質的価値=AI経営支援。決済はデータ収集基盤
- B-02 [user] 低価格SaaSで広く撒く→データ蓄積→コンサルで稼ぐ
- B-03 [user] 決済基盤: POCはStripe継続。Square連携はPOC後判断
- B-04 [user] エリア集中戦略: 中目黒から開始
- B-05 [user] サービス料: 全店舗デフォルトoff(0%)、店舗ごとにon/off可能
- B-06 [user] 来店予約: POCスコープに含む
- B-07 [user] Dine-in: POC後に持ち越し
- B-08 [user] UIUX最高品質がCC依頼・設計判断の最上位原則

---

## 料金体系（P-01〜P-04）
- P-01 [reference] STD ¥0 / PRO ¥4,980 / EXPERT ¥9,800（月額/venue）
- P-02 [reference] 手数料率: Dine-in 3.8% / Takeout・Delivery 4.0%
- P-03 [reference] Stripe手数料3.6%はWeir負担（実質マージン: dine-in 0.2%, takeout/delivery 0.4%）
- P-04 [reference] AI無料枠: レビュー返信10件/月, SNS投稿10件/月, POP画像1件/月, 月次AIコメント1件

---

## POC後の課金移行フロー（S-01〜S-06）

| # | 項目 | 決定内容 |
|---|---|---|
| S-01 | 無料期間の検知方法 | DB + pg_cron（Weir側で完結管理） |
| S-02 | 無料期間の計算基準 | service_subscriptions.activated_at + 30日 |
| S-03 | 移行フロー | pg_cronがアラート発火 → 管理マスタにバナー表示 → Taiseiが承認ボタン押下 → Stripe Subscription新規作成 |
| S-04 | Stripe Subscription作成タイミング | POC終了後・Taisei承認時が初回（POC中はSubscription未作成） |
| S-05 | merchant通知 | 不要（Taiseiが適切なタイミングで承認するため） |
| S-06 | POC期間中のMO手数料 | application_fee_amountをゼロにして決済（Mx負担ゼロ）。実装済み commit 9cc99fd |

---

## 開発・運用ルール（D-01〜D-19、D-77〜D-115）
- D-01 [feedback] CC依頼: 本番URL確認必須。スキップ時は「未確認」と明記
- D-02 [feedback] CC依頼・方針決定時のエージェント横断レビュー必須
- D-03 [feedback] アップロード用mdファイルはワンクリックDL可能なファイル形式で渡す
- D-04 [feedback] 改善はレポート→承認制。エージェント定義の自動書き換え禁止
- D-05 [reference] エージェント管理: .claude/agents/ がマスター(Single Source of Truth)
- D-06 [feedback] 決定事項追加の都度、ClaudeがこのMDを更新する
- D-07 [user] 日報: 毎日19:00にClaude側からpush型でリマインド
- D-08 [user] 日報リマインダー時間: 19:00
- D-09 [feedback] タスク優先度はdecisions.mdで管理（引き継ぎ漏れ防止）
- D-10 [reference] Phase 0自動化: crontab+Claude CLI統一（Cowork全9タスク削除済み）
- D-11 [feedback] SQL生成時はinformation_schema.columnsで実テーブルカラムを確認してから出力
- D-12 [reference] Phase 0: 「異常or提案がある時だけメール通知」方式。5分間隔で同時実行回避
- D-13 [reference] チームB: 7エージェント構成。承認ポイント3箇所
- D-14 [feedback] 全アウトプットに⑦Output Review Templateを必須セクションとして含める
- D-15 [user] デリバリーはPOCスコープ外。テストは「選択不可確認」1項目のみ
- D-16 [feedback] テストはコードレビュー+実ブラウザテストの2段階
- D-17 [reference] crontabスケジュール: 6:00台。リトライ機構あり
- D-18 [project] 受注アプリ: テスト37/37 PASS完了(2026-04-10)。ウォークイン実機確認待ち
- D-19 [feedback] CC完了報告フォーマット: status/summary/changes/verification/manual_actions
- D-77 [project] DBに存在しないテーブル: brand_contents/crm_templates/sns_account_settings。migration SQLで参照禁止
- D-78 [project] staff_accounts RLS: 現在USING(true)に一時緩和中。POC後にbrand_idスコープに再制限
- D-79 [project] 管理マスタ+顧客管理ログイン: taisei.maeda@weir.co.jp / AidenTest2026!（role: owner）
- D-80 [reference] Vercelデプロイ方法: source ~/.nvm/nvm.sh && cd /Users/taisei/Desktop/aiden-demo && vercel --prod --yes 2>&1
- D-81 [project] ✅ L-10 admin@weir.co.jpエイリアス作成完了(2026-04-05)
- D-82 [reference] staff_accounts.role CHECK制約: owner/editor/viewerのみ許可
- D-83 [project] ハードコードでのデータ生成・表示は一切禁止。nullの方がマシ。フロント・バックエンド問わず全コードに適用(2026-04-10確定)
- D-84 [project] 用語統一(2026-04-10): 法人=merchant、店舗=venue。コード変数名・ドキュメント・会話内・DB含め完全統一
- D-85 [project] ステータス統一(2026-04-10): merchant/brand/venue全てactive/suspendedで統一
- D-86 [project] FCモデル対応DB実装完了(2026-04-10)
- D-87 [project] 管理マスタ機能追加(2026-04-10): merchant/brand/venue削除機能・ポップアップ詳細・ハッシュルーティング・ブランドHP/MOリンク表示実装済み
- D-88 [project] xorderドメイン(2026-04-10): xorder.co.jp仮登録済み（合同会社設立後に本登録）。Vercel Proアップグレード済み。*.xorder.co.jp設定済み。DNS反映完了
- D-89 [project] DB完全用語統一(2026-04-10): corporations→merchants、stores→venues実施済み
- D-90 [project] menu_patterns RLS修正(2026-04-11): authenticated INSERT/UPDATE/DELETEポリシー追加完了
- D-91 [project] 音声機能(2026-04-10): Web Speech API実装済み。ウェイクワードパターン11種。commit aa2e6b3。POC前に実機確認必須
- D-92 [project] corpsテーブル(2026-04-11): merchants.stripe_account_idに統合完了。commit e94cfac
- D-93 [project] ✅ run-migration EF完全削除完了(2026-04-11): commit 0762325
- D-94 [project] 注文管理画面追加(2026-04-11): 管理マスタにプラットフォーム横断注文管理追加。commit 80780ef
- D-95 [project] venues.menu_pattern_id追加(2026-04-11): 1店舗=1パターンの1対1紐づけ。SQL実行完了
- D-96 [project] MOページメニュー構造(2026-04-12確認): MOページはmenu_pattern_items中間テーブルを使用。menu_pattern_itemsにSQL投入済み（17件）。RLSポリシー追加済み（anon SELECT）
- D-97 [feedback] CC修正後は毎回「このタスクで発見した問題・回避策があればCLAUDE.mdのGotchasセクションに追記して報告せよ」と指示する
- D-98 [feedback] DB削除のSQL生成はinformation_schemaで全FK制約を取得してからトポロジカル順に生成させる。推測生成は禁止（2026-04-13: 手戻り6回の教訓）
- D-99 [feedback] 大規模DB削除はCCに依頼する（ChatのブラウザスキャンはFK網羅に限界がある。CCはSupabase Management API経由で実DBスキャン可能）
- D-100 [feedback] BULK_TEMPLATESとTEMPLATESは別システム。混同するとブランド一括登録0件バグが発生する（cc-brand-bulk-import-fix 2026-04-13）
- D-101 [feedback] MERCHANTS.push後にCBR.push・VENUES.pushにcorpUuidが必要。ないとブランド/店舗一覧が法人詳細タブに表示されない（cc-corp-template-xlsx-fix 2026-04-13）
- D-102 [project] ハードコード全件調査完了（2026-04-13）: HIGH 25件・MEDIUM 11件。api/・supabase/functions/はゼロ件。HIGH対応完了（commits c7a3b8e / 9d1f3f6 / 6f40afc）
- D-103 [project] 来店予約ON/OFFをservice_subscriptions（key=reservation）で管理する方式に変更（commit 60c8e40 2026-04-13）
- D-104 [reference] CC Best Practice導入（2026-04-13）: CLAUDE.md Gotchasセクション必須・CCに検証手段（curl+grep）を与える・繰り返しCC依頼は.claude/commands/に登録する
- D-105 [project] 手動ウィザード（openCorpWizard）にもCBR未挿入・corpUuid未設定の同一バグ残存。修正済み commit 6b54bfb（2026-04-13）
- D-106 [feedback] CCデプロイ完了後、Chat側がFirecrawlで全本番ページをスキャンする。ルールではなく仕組みとしてcc-template-v2.mdの完了報告フォーマットに組み込み済み（commit a8bf3be）
- D-107 [project] brands.corp_id→merchant_id リネームバグ修正完了(2026-04-14): 6箇所のPOSTボディを修正 commit a847365。ブランド一括登録0件問題の根本原因
- D-108 [project] HPテンプレートシステム実装済み(2026-04-09): templates/brand_templatesテーブル・public/templates/template-a〜e完備。ブランド登録時にテンプレート選択必須化 commit 6a086aa
- D-109 [project] brand_hero_slides RLS追加(2026-04-14): authenticated INSERT/DELETEポリシー追加。mediaバケット統合（ロゴ: {brand_id}/logo/、ヒーロー: {brand_id}/hero/）commit e59fe48
- D-110 [project] aiden-common.js slug解決バグ修正(2026-04-14): venues.slug→brands.slug参照に変更。誤コメント削除。commit 2f32508
- D-111 [project] テンプレートファイル名変更(2026-04-14): aiden_corp_template→aiden_merchant_template、aiden_store_template→aiden_venue_template。commit 84320a7
- D-112 [project] 店舗一括登録ヘッダー検証追加(2026-04-14): BULK_TEMPLATESとTEMPLATESの混同防止。誤ったファイルアップロード時に「データ一括管理ページを使用してください」と誘導。commit 2534582
- D-113 [project] ブランド管理UI修正(2026-04-14): 法人詳細ブランド一覧タブ・ブランド詳細法人ID表示・サービス設定デリバリー/予約追加・HP準備中制御・テンプレート選択必須化。commits 352daf0 + 6a086aa
- D-114 [project] デザイン/HP設定修正(2026-04-14): D-83違反是正（初期値null化）・カスタムドメインaidenドメイン表記削除・brand_templates.customization.colors同期バグ修正・ロゴ+ヒーローバナードロップゾーン追加。commits 5a76990 + e59fe48
- D-115 [feedback] 店舗テンプレートの「価格帯」列（col 7）は未使用のため削除済み（APIのPOSTボディに含まれない。「昼の価格帯」「夜の価格帯」で完全カバー）。ヘッダー検証の「店舗名*」一致チェックのバグも同時修正。commit c9ee65c(2026-04-14)

---

## 命名規則（2026-04-10確定）
- 受注アプリ: Flutter製受注管理アプリの社内外共通名称。GitHubリポジトリ名aiden-posは維持
- Weir Hub: Uber Eats/出前館等マーケットプレイス注文受注サービス開始時のサービス名（将来）
- merchant: 法人（DB: merchants）
- venue: 店舗（DB: venues）

---

## HPテンプレート仕様（T-01〜T-05）
- T-01 [project] テンプレート5種: TPL-A(SILENT CURATOR/写真訴求)・TPL-B(丼丸/効率特化)・TPL-C(月白/予約特化)・TPL-D(NAMI BOWL/自由)・TPL-E(烈火/こだわり)
- T-02 [project] 技術構造: brand.htmlが1ファイルでDB参照して動的CSS切替。新テンプレート=DBレコード+CSSファイル追加のみ
- T-03 [user] ブランド登録時にテンプレート選択必須（選択なし→HP公開不可）
- T-04 [user] 新規デザイン作成: TaiseiがFigmaでデザイン→CCが実装
- T-05 [project] hp_status: 'draft'（非公開）/ 'published'（公開）。既存炭火亭はpublished維持

---

## 来店予約仕様（R-01〜R-10）
- R-01〜R-08: 基本仕様確定済み（詳細はdecisions/reservations.md）
- R-09 [project] ✅ バックエンド全完了(2026-03-27)
- R-10 [user] 来店予約は課金対象外・全プラン無償提供(2026-04-11確定)

---

## メニュー管理仕様（M-01〜M-12）

| # | 項目 | 決定内容 |
|---|---|---|
| M-01 | 階層構造 | Brand → MenuPattern → Product → ProductSize（任意） |
| M-02 | パターン共有 | ブランド専用（複数ブランド間の共有不可） |
| M-03 | サイズ | 一部商品のみ。product_sizesで管理 |
| M-04 | 画像 | Supabase Storage「menu-images」バケット。5MB上限 |
| M-05 | 権限（管理マスタ） | 全操作可 |
| M-06 | 権限（顧客管理） | owner=CRUD、editor=CR+Update、viewer=R |
| M-07 | 顧客管理移植 | メニュー管理画面は顧客管理画面にも移植完了(2026-04-12) |
| M-08 | 店舗↔パターン紐づけ | 1店舗は常に1パターンのみ紐づく（1対1）。venues.menu_pattern_id FK追加済み |
| M-09 | 管理マスタUIアクセス方式 | display_id検索ベース（MRC-/BRD-/STR-対応） |
| M-10 | 時間帯設定 | フェーズ2 |
| M-11 | 商品多カテゴリ | フェーズ2 |
| M-12 | 商品プール | 商品は全商品をブランド単位で表示。パターン紐づけは任意のタイミングで設定可能 |

---

## Uber Direct連携仕様（UD-01〜UD-07）— 仕様確定・実装はPOC後

| # | 項目 | 決定内容 |
|---|---|---|
| UD-01 | デリバリーパートナー | Uber Directのみ（Wolt日本撤退） |
| UD-02 | APIアカウント管理 | Weirが一括保有・Mxに代わってAPIを呈請 |
| UD-03 | 実装タイミング | POC後 |
| UD-04 | 配送料方式① | UDの見積もり料金をそのままエンドユーザーに表示・負担 |
| UD-05 | 配送料方式② | Mxが任意に設定（固定/無料閾値/将来:距離帯別）。delivery_fee_settingsテーブルで管理 |
| UD-06 | 配達員手配 | confirm-order EF内で自動手配 |
| UD-07 | 自社配達との切替 | 店舗設定でデフォルト決め、受注アプリで注文単位に変更可能 |

---

## products.sale_status CHECK制約（2026-04-12確認）
有効値: 'on_sale' / 'sold_out' / 'discontinued' / 'sold_out_today'
※ 'available' は無効（使用不可）

---

## Go/No-Go判定基準
- G-01〜G-08: Go条件8項目（G-01 ✅, G-02 🔄P0-7依存, G-03 ✅, G-04 ✅, G-05 ✅, G-06 🔄P1-3依存, G-07 ✅, G-08 ✅）

## CS導線設計（CS-01〜CS-03）
- CS-01 [user] 事業者向け: 右下固定チャットアイコン、AI自動応答
- CS-02 [user] エンドユーザー向け: MO画面フッター+マイページ、AI自動応答
- CS-03 [reference] AIの知識源: FAQ + 操作マニュアル + 契約情報

## 法務・インフラ（L-01〜L-10）
- L-01 [reference] 事業者名: 個人事業主 前田 大生（屋号: Weir）
- L-02 [reference] 所在地: 渋谷道玄坂東急ビル2F-C（GMOバーチャルオフィス）
- L-09 [reference] PP・利用規約の公開URL作成完了
- L-10 [project] ✅ admin@weir.co.jpエイリアス作成完了(2026-04-05)
