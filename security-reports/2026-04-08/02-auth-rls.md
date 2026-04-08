# 認証・アクセス制御テスター（Auth & RLS Tester）セキュリティテストレポート

**実行日**: 2026-04-08
**対象リポジトリ**: github.com/taiseiwolt/aiden-demo + github.com/taiseiwolt/aiden-pos
**対象コミット**: dfc961121447fdd0c593b6f269cead14e20df1a2

## サマリ
- チェック項目数: 64テーブル検証 + 8カテゴリチェック
- 問題なし: 30テーブル
- 要改善（P2/P3）: 5件
- 脆弱性あり（P0/P1）: 14件

---

## RLSポリシー全テーブルステータス一覧

### RLS有効 + 適切なポリシー設定済み（問題なし）

| テーブル | ポリシー概要 |
|---------|------------|
| members | select/update/insert_own + service_role |
| monitoring_alerts | service_role only |
| device_tokens | authenticated_manage_own (auth.uid()) |
| payment_attempts | service_role_all |
| audit_logs | service_role_all |
| ai_interactions | service_role + authenticated_select_own_store |
| fee_schedules | service_role_only |
| user_bans | service_role + anon/auth read active |
| brand_permissions | service_role + authenticated_read_own |
| platform_settings | service_role_only |
| menu_patterns | service_role + authenticated_read_own_brands |
| store_tables | service_role_full_access |
| store_channels | service_role + authenticated select/upsert/update |
| crm_send_logs | service_role + authenticated_read_own_brand |
| usage_limits | service_role + authenticated own |
| usage_logs | service_role + authenticated own |
| templates | public_read (is_active) + service_write |
| brand_hero_slides | service_role + anon/auth_read_active |
| brand_campaigns | service_role + anon/auth_read_active |
| brand_coupons | service_role + authenticated_read_active |
| store_hours | select_all + service_role（公開データ） |
| corporations | select_authenticated + service_role |
| brands | select_authenticated |
| stores | select_authenticated |
| service_subscriptions | select_authenticated + service_role |
| guest_registration_prompt | RLS有効 + ポリシー設定済み |
| first_time_incentives | RLS有効 + ポリシー設定済み |
| member_coupons | RLS有効 + ポリシー設定済み |
| db_metrics / edge_function_logs / alert_history | service_role |
| plan_change_requests / invoice_adjustments / sns_posts / sns_connections | service_role |

---

## 発見事項

### P0/P1（即時対応）

#### P0-1: service_role JWTがマイグレーションファイルにハードコード（Git公開済み）
- **対象**: `supabase/migrations/20260406400000_reservation_push_trigger.sql` line 19, `supabase/migrations/20260324100000_sec7_sec8_cron2_fixes.sql` line 55
- **内容**: Supabase service_role JWTが平文でマイグレーションファイルにコミットされている。リポジトリにアクセスできる者は全RLSポリシーをバイパスし、全テーブルの全データに無制限アクセス可能。
- **再現手順**: GitHubリポジトリからservice_role JWTを抽出 → Supabase REST APIにBearer tokenとして使用
- **影響**: 全テナントの全データ（顧客PII、注文、決済情報）への無制限アクセス
- **修正方針**: **即座にservice_role keyをローテーション**。マイグレーションファイルからハードコードを削除。pg_cron HTTP呼び出しにはVault secretを使用。
- **フェーズ影響**: Phase 1（即時）

#### P0-2: 競合分析テーブル — FOR ALL USING(true) ロール制限なし
- **対象**: `supabase/migrations/20260323000000_competitor_collection.sql` lines 92-95
- **テーブル**: competitor_collection_config, competitor_stores, competitor_reviews, competitor_metrics_weekly
- **内容**: `FOR ALL USING (true) WITH CHECK (true)` に `TO service_role` 句がない。anonを含む全ロールがSELECT/INSERT/UPDATE/DELETE可能。
- **再現手順**: anon keyでSupabase REST APIを呼び出し、competitor_storesをクエリ
- **影響**: 競合分析データの漏洩・改ざん・削除
- **修正方針**: 全4テーブルのポリシーに `TO service_role` を追加
- **フェーズ影響**: Phase 1

#### P0-3: orders — 認証済みユーザーが全注文を閲覧可能
- **対象**: `supabase/migrations/20260330000002_realtime_authenticated_select.sql` line 12
- **内容**: `CREATE POLICY "orders_authenticated_select_all" ON orders FOR SELECT TO authenticated USING (true)` — エンドユーザーを含む全認証済みユーザーが全店舗・全ブランドの全注文を閲覧可能。
- **影響**: 配送先住所、顧客名、payment_intent_id等のPII・ビジネスデータ漏洩
- **修正方針**: store_id/brand_idスコープのポリシーに置換。RealtimeはサーバーサイドフィルタリングまたはRLSでストアコンテキストに制限。
- **フェーズ影響**: Phase 1

#### P0-4: store_policies — anon完全CRUD
- **対象**: `supabase/migrations/20260324000000_ai_chat_support.sql` lines 79-92
- **内容**: 匿名ユーザーがSELECT/INSERT/UPDATE/DELETEを無制限に実行可能
- **影響**: 店舗ポリシー（返金ルール、アレルゲン情報等）の改ざん・削除
- **修正方針**: anon書き込みアクセスを削除、service_role/staffに制限
- **フェーズ影響**: Phase 1

#### P0-5: FAQs — anon INSERT/UPDATE/DELETE
- **対象**: `supabase/migrations/20260318100000_customer_support.sql` lines 227-236
- **内容**: 匿名ユーザーがFAQエントリを作成・変更・削除可能
- **修正方針**: anon書き込みアクセスを削除
- **フェーズ影響**: Phase 1

#### P0-6: Google Reviewsテーブル — FOR ALL USING(true) ロール制限なし
- **対象**: `supabase/migrations/20260318200000_google_reviews.sql` lines 93-97
- **テーブル**: google_places, google_reviews, competitor_mappings, collection_progress, review_alerts
- **内容**: P0-2と同様、`TO service_role`句なし。全ロールがフルアクセス可能。
- **修正方針**: `TO service_role`を追加
- **フェーズ影響**: Phase 1

#### P1-1: メンバーシップテーブル — ロール制限なし
- **対象**: `supabase/migrations/20260316100000_membership_program.sql`
- **テーブル**: point_settings, rank_settings, review_point_settings, review_tokens
- **内容**: 全ポリシーが `USING(true)` / `WITH CHECK(true)` でロール制限なし。anonを含む全ロールが読み書き可能。
- **影響**: ポイント付与率、ランク閾値の改ざん、レビュートークンの偽造
- **修正方針**: `TO service_role`または適切なロールに制限
- **フェーズ影響**: Phase 1

#### P1-2: 複数テーブルが認証済みユーザーに無制限書き込みを許可
- **テーブル**: brand_contents, crm_templates, sns_account_settings, staff_store_assignments, brand_templates
- **内容**: `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — 認証済みユーザーなら他ブランドのコンテンツ、テンプレート、SNS設定、スタッフ配置を変更可能
- **修正方針**: brand_id/store_idスコープのポリシーに変更
- **フェーズ影響**: Phase 1

#### P1-3: SECURITY DEFINER関数にREVOKE EXECUTE FROM PUBLICなし
- **対象**: check_ai_usage_limit(), anonymize_chat_for_withdrawn_member(), notify_new_reservation(), update_member_order_stats(), deduct_points(), grant_compensation_points(), check_and_upgrade_rank()
- **内容**: これらの関数はanonを含む全ロールから呼び出し可能。deduct_points()とgrant_compensation_points()でポイント残高操作、check_and_upgrade_rank()でランク強制昇格が可能。
- **修正方針**: 全SECURITY DEFINER関数に`REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ON FUNCTION ... TO service_role;`を追加
- **フェーズ影響**: Phase 1

#### P1-4: reservations — anon INSERT無制限
- **対象**: `20260326000001_reservations.sql` line 81
- **内容**: `anon_insert FOR INSERT TO anon WITH CHECK (true)` — データ検証なしで予約を無制限に挿入可能
- **修正方針**: Edge Function経由でのみ挿入を許可、または最低限のバリデーション追加
- **フェーズ影響**: Phase 2

#### P1-5: products, product_sizes, staff_accounts — RLS未設定
- **内容**: これらのコアテーブルにALTER TABLE ... ENABLE ROW LEVEL SECURITYがマイグレーションファイルに存在しない
- **修正方針**: 本番DBで確認し、未設定であれば即座にRLS有効化 + ポリシー設定
- **フェーズ影響**: Phase 1

#### P1-6: payments, refunds — ポリシー作成済みだがRLS未有効化
- **対象**: `20260323200001_fix_rls_security.sql`
- **内容**: ポリシーは作成されているがENABLE ROW LEVEL SECURITYが呼ばれておらず、ポリシーが無効
- **修正方針**: ALTER TABLE payments/refunds ENABLE ROW LEVEL SECURITY を実行
- **フェーズ影響**: Phase 1

---

### P2/P3（計画的対応）

#### P2-1: チャットテーブル — anon SELECT/INSERT/UPDATE
- **対象**: chat_sessions, chat_messages
- **内容**: ゲストチャットサポートのため意図的な可能性があるが、全店舗のチャット履歴を読み書き可能
- **フェーズ影響**: Phase 1

#### P2-2: 顧客チャットテーブル — 全ロールフルアクセス
- **対象**: customer_chats, customer_chat_messages
- **内容**: `_all`ポリシーでロール制限なし
- **フェーズ影響**: Phase 1

#### P2-3: invoices — オープンSELECT
- **対象**: invoices
- **内容**: `select_all USING(true)`で全ユーザーが全請求書を閲覧可能
- **フェーズ影響**: Phase 1

#### P2-4: PIIカラムREVOKEがanonのみ
- **内容**: `sec11_revoke_pii_columns.sql`のREVOKEがanonロールのみ。authenticatedロールはordersテーブルのdelivery_address、customer_name等に完全アクセス可能（P0-3と組み合わせで全PII閲覧可能）
- **フェーズ影響**: Phase 1

#### P3-1: Supabase URL/anon keyのHTMLハードコード
- **内容**: 標準的なSupabaseの使い方だが、全テーブルのRLSが適切であることが前提
- **フェーズ影響**: Phase 1

---

### 問題なし
- service_role keyはHTMLファイルに露出していない
- Edge Functionsに--no-verify-jwtフラグなし
- Edge FunctionsはDeno.env.get()で環境変数から秘密情報を取得
- 監視系RPC関数はPUBLICからREVOKE済み
- device_tokensはオーナーのみアクセス
- 注文トラッキングはtracking_tokenをSECURITY DEFINER関数経由で使用（適切）
