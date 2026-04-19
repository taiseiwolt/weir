# CC AI-B 完了報告書: AI 機能 P0 修正 + P1 基盤実装

**発注日**: 2026-04-19 朝
**完了日**: 2026-04-19
**ベースコミット**: 937eb82 (main)
**スコープ**: 実装 + migration ファイル作成 + コード変更 (本番 deploy は Tasei 指示待ち)
**前提入力**: `cc-requests/CC_AI-A_report_20260419.md` (CC L 級調査、540 行)

---

## ⚠️ 手動作業リスト (Tasei 必須)

本依頼の成果物を本番反映するために Tasei が実施する作業。**順番厳守**。

### A. Supabase SQL ダッシュボードで migration 3 本を順次実行

> URL: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz/sql

| # | ファイル | 効果 | 危険度 |
|---|---|---|---|
| A1 | `supabase/migrations/20260419100000_ai_monthly_comments.sql` | 新規テーブル作成、月次 AI コメントのキャッシュ層 | 低 (新規 only、既存に影響なし) |
| A2 | `supabase/migrations/20260419200000_ai_usage_logs.sql` | 新規テーブル作成、AI コスト集計の根拠データ | 低 (新規 only、既存に影響なし) |
| A3 | `supabase/migrations/20260419300000_fix_crm_send_logs_rls.sql` | crm_send_logs RLS 修正 (auth_uid → auth_user_id) | 中 (既存 policy DROP→CREATE、authenticated SELECT が復活) |

実行手順 (各 migration 共通):
1. Supabase ダッシュボードの SQL Editor を開く
2. 上記ファイルの内容をコピーペースト
3. `Run` クリック → エラーなしを確認
4. 別タブで `SELECT * FROM information_schema.tables WHERE table_name IN ('ai_monthly_comments', 'ai_usage_logs');` を実行し 2 行返ってくることを確認

### B. Supabase Dashboard で Edge Functions を deploy

> URL: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz/functions

| # | EF 名 | 種別 | 変更内容 |
|---|---|---|---|
| B1 | **analyze-store-performance** | 新規 | 20 種類分析の基盤 EF (daily のみ実装) |
| B2 | generate-monthly-comment | 既存更新 | ai_monthly_comments + ai_usage_logs INSERT 追加 |
| B3 | generate-review-reply | 既存更新 | ai_usage_logs INSERT 追加 |
| B4 | generate-sns-post | 既存更新 | ai_usage_logs INSERT 追加 |
| B5 | generate-pop-image | 既存更新 | ai_usage_logs INSERT 追加 + cost_usd=0.04 計上 |
| B6 | collect-competitor-data | 既存更新 | ai_usage_logs バッチサマリ INSERT |
| B7 | google-places-background-collector | 既存更新 | ai_usage_logs バッチサマリ INSERT |
| B8 | google-reviews-collector | 既存更新 | ai_usage_logs バッチサマリ INSERT |

deploy 手順 (各 EF 共通):
1. ローカル: `supabase functions deploy <ef_name>` (Supabase CLI 経由)
   - または Dashboard > Edge Functions > 該当 EF > `Deploy from local`
2. deploy 後、`supabase functions logs <ef_name> --tail 50` で起動エラーがないことを確認
3. **重要**: B2〜B8 の更新 EF は新規 helper `_shared/ai-usage-log.ts` を import するため、deploy 時は EF と _shared を同時に upload すること (CLI なら自動、ダッシュボード手動 upload では _shared フォルダが含まれることを確認)

deploy 順序の推奨: **B1 → B2〜B8 (順不同)**。B1 は新規なので最優先、B2〜B8 は既存への変更で並列 deploy 可能。

### C. Vercel Deploy

frontend 変更 (`weir-customer-admin.html`, `weir-admin.html`) は main push で自動 deploy されるが、CLAUDE.md の警告通り GitHub auto-integration は壊れている可能性がある。確実にしたい場合は `vercel --prod` を手動実行。

### D. Push 確認

本依頼の 9 コミットは local main にコミット済、まだ push していない。Tasei 確認後 `git push origin main` で remote に反映。

---

## ✨ 重要発見サマリー

実装中に判明した、CC AI-A 報告書未掲載 / 設計判断が必要だった事項:

### 🔵 発見 1: SNS 投稿 EF 仕様ミスマッチ (typo 修正だけでは不足)

CC AI-A は「URL 1 文字変更」と推定したが、実際には **リクエスト body と レスポンスパース両方が EF 仕様と不整合**:

| 項目 | フロント現状 | EF 仕様 |
|---|---|---|
| body キー | `brand_id` | `venue_id` (or store_id 後方互換) |
| platform 値 | 'X' / 'Instagram' / 'LINE' / 'Facebook' / 'TikTok' | 'x' / 'instagram' / 'line' のみ |
| レスポンス | `result.content` / `result.data` | `result.variants[]` (3 トーン配列) |

**対応**: タスク 1 で 3 点全て修正。Facebook / TikTok は EF 未対応のため demo template に明示フォールバック。

### 🔵 発見 2: ai_monthly_comments スキーマ設計ジレンマ

発注書スペックは `venue_id NOT NULL` のみだが、frontend `loadMonthlyAiComment()` は `brand_id` で SELECT する既存設計。

**判断**: スキーマに `venue_id NOT NULL` + `brand_id NOT NULL (denormalized FK)` 両方を追加。`UNIQUE(venue_id, year, month)` で 1 venue × 1 月 = 1 レコードを保証、`idx (brand_id, year DESC, month DESC)` でブランド単位検索高速化。

### 🔵 発見 3: 顧客管理画面 月次コメントの表示単位

Customer admin は brand 単位ダッシュボード、EF は venue 単位生成。**設計判断**: `STORES[0]` (primary venue) で生成・表示。複数店舗ある場合は最初の店舗のコメントが代表として表示される。POC では十分、将来的な venue selector 拡張は次依頼。

### 🔵 発見 4: ai_usage_logs スキーマ vs 既存 weir-admin loader の整合性

旧 `loadRealCostLogs()` は `feature_type` / `api_cost_yen` / `corp_id` 等の旧スキーマを参照。新 migration では `feature` / `cost_usd` / `merchant_id` に統一。**対応**: タスク 4.3 で loader を新スキーマに完全書換、`USD_TO_JPY=150` 概算で円換算、ftMap で EF feature 名 → COST_CONTENT_TYPES.key に再マッピング。

### 🔵 発見 5: バックエンドバッチ EF (3 件) の usage log 設計

`collect-competitor-data` 等のバッチ EF は単一 venue でなく複数を一括処理。**判断**: バッチ実行 1 回につき 1 サマリ レコード INSERT (`venue_id=NULL`, `merchant_id=NULL`, `metadata` に件数・API 呼出回数を記録)。コスト計上は外部 API 単価 ($32/1000 for Places, $17/1000 for Details) を使用。

---

## 1. タスク 1: SNS 投稿 EF 名 typo 修正

### 1.1 修正内容

ファイル: `weir-customer-admin.html` (`snsGeneratePost()` 関数、行 15358 付近)

| 変更項目 | Before | After |
|---|---|---|
| EF 名 (URL) | `/functions/v1/generate-sns-content` | `/functions/v1/generate-sns-post` |
| body | `{ brand_id, platform, topic }` | `{ venue_id: STORES[0].id, platform: 'x'/'instagram'/'line', topic }` |
| platform 変換 | なし | `efPlatformMap = { 'X':'x', 'Instagram':'instagram', 'LINE':'line' }` |
| レスポンス処理 | `result.content || result.data` | `result.variants[]` ループで 3 トーン表示 |
| Facebook/TikTok 対応 | EF 呼出 → エラー | demo template + 明示メッセージ "AI 生成未対応" |
| XSS 対策 | 部分的 | escH() を全表示箇所に適用 |

### 1.2 検証結果

| 項目 | 検証方法 | 結果 |
|---|---|---|
| `generate-sns-content` 残存検索 | Grep で全 `.html` ファイル | ✅ 0 件 (typo 解消) |
| `generate-sns-post` EF 仕様確認 | Read `supabase/functions/generate-sns-post/index.ts` | ✅ body venue_id 必須、platform は x/instagram/line のみ確認済 |
| 構文確認 | 目視 | ✅ JS 構文エラーなし |
| ブラウザ実動作 | **検証不可** (本番 deploy 後のみ) | ❌ Tasei 確認待ち |

### 1.3 コミット

```
e6186ea fix(ai): correct SNS post EF name and request format (P0-A)
```

---

## 2. タスク 2: 月次 AI コメント (案 B 実装)

### 2.1 migration

ファイル: `supabase/migrations/20260419100000_ai_monthly_comments.sql` (54 行)

スキーマ要点:
- `venue_id` (NOT NULL FK to venues), `brand_id` (NOT NULL FK to brands, denormalized)
- `year` INT (CHECK 2020-2100), `month` INT (CHECK 1-12)
- `comment_text` TEXT, `model` VARCHAR(100), `input_tokens`, `output_tokens`
- `UNIQUE(venue_id, year, month)` で月次 1 レコード保証
- 2 インデックス: `(brand_id, year DESC, month DESC)`, `(venue_id, year DESC, month DESC)`
- RLS: authenticated は `staff_accounts.brand_id` 経由で自ブランド SELECT、service_role は INSERT/UPDATE/DELETE

### 2.2 EF 修正

ファイル: `supabase/functions/generate-monthly-comment/index.ts`

追加処理:
- Claude API 成功後に `ai_monthly_comments` へ `upsert(onConflict='venue_id,year,month')`
- 同時に `logAiUsage()` で `ai_usage_logs` にも記録
- Claude エラー時も `ai_usage_logs` に status='error' 記録 (タスク 4.2 と統合実装)
- venue UUID は `display_id` (STR-prefix) / UUID 両対応 (既存 ai-quota.ts の `resolveStoreId` と同等挙動)

### 2.3 フロント修正

ファイル: `weir-customer-admin.html` `loadMonthlyAiComment()` (行 10268)

新フロー:
1. `ai_monthly_comments` から `brand_id` で最新月のキャッシュ SELECT
2. キャッシュあり → `comment_text` を表示、対象月と生成日も併記
3. キャッシュなし → `STORES[0]` (primary venue) と前月分 (`YYYY-MM`) で `generate-monthly-comment` EF 呼出
4. EF 成功 → 再 SELECT して表示。DB 反映遅延時は EF レスポンスの `comment` をフォールバック表示
5. EF 失敗 → 「ご利用いただけません」エラーメッセージ

### 2.4 検証結果

| 項目 | 検証方法 | 結果 |
|---|---|---|
| migration SQL 構文 | 目視 (DDL 文法) | ✅ 構文 OK |
| RLS 整合性 | 既存 RLS パターン (`fix_rls_security.sql`, `customer_support.sql` 等) と比較 | ✅ `staff_accounts.auth_user_id` 一貫 |
| EF 構文 | 目視 (TS) | ✅ Deno 未インストールのため自動チェック不可だが、既存パターン踏襲 |
| upsert onConflict 文字列 | UNIQUE 制約名と一致確認 | ✅ `'venue_id,year,month'` |
| frontend 構文 | 目視 (JS) | ✅ XSS 対策 escH() 適用 |

### 2.5 コミット

```
d65aec3 feat(db): add ai_monthly_comments table for cached monthly AI comments
66ce473 feat(ai): write monthly comment to ai_monthly_comments cache + ai_usage_logs
614f09f feat(ai): rewrite loadMonthlyAiComment for cache + on-demand generation (P0-B)
```

---

## 3. タスク 3: 20 種類 AI 売上分析 EF 基盤

### 3.1 新規 EF

ファイル: `supabase/functions/analyze-store-performance/index.ts` (約 280 行)

**設計**:
- リクエスト: `{ type, brand_id, kpi: { sales, orders, avg } }` (frontend 既存仕様)
- 20 種類のうち `daily` のみ実装、残り 19 は `{ success: false, status: 'not_implemented', type, label, message }` を 200 で返却
- `IMPLEMENTED_TYPES = new Set(['daily'])` 配列で管理、CC AI-C で追加するたびに拡張

**daily 実装内容**:
- `STORES[0]` (primary venue) の直近 30 日 `orders` を集計
- 日別 count + gmv、上位/下位 5 日、合計、平均日次売上
- Claude (claude-sonnet-4-20250514) で経営アドバイス生成
- `ai_interactions` + `ai_usage_logs` 両方に記録 (success/error)

### 3.2 frontend 対応

ファイル: `weir-customer-admin.html` `sdAiAnalysis()` (行 8974)

修正内容:
- `result.status === 'not_implemented'` を判定して専用 UI 表示
- 成功時 `result.analysis` を `escH()` で表示 (XSS 対策)
- catch 句は EF 呼出ネットワークエラー用 (Coming Soon UI フォールバック維持)

### 3.3 検証結果

| 項目 | 検証方法 | 結果 |
|---|---|---|
| EF 構造 | 既存 `generate-monthly-comment` と比較 | ✅ パターン一貫 |
| broken reference 解消 | frontend 行 8999 → 新 EF が応答することを保証 | ✅ deploy 後に 500 でなく 200 返却を確認可能 |
| 残り 19 種類 | `not_implemented` レスポンス | ✅ コード上で確認、UI 表示は deploy 後検証 |
| brand → venue 解決 | `resolvePrimaryVenue` 関数 | ✅ 最初の (created_at ASC) venue を返す |

### 3.4 残課題

- 19 種類の本格実装は **CC AI-C** で対応 (channel/hourly/heatmap/access/userTrend/freqDist/productRank/prodTrend/abc/prodHeatmap/channelProd/newProd/bmRank/gap/radar/bmHourly/bmChannel/bmTrend/effect)
- クォータキー: 現状 `sns_post` を流用、将来的に `analyze_store_performance` 専用キーを `STD_LIMITS` に追加すべき (現状 STD ユーザは sns_post と枠を共有)

### 3.5 コミット

```
1f35c80 feat(ai): add analyze-store-performance EF skeleton with daily analysis (P0-C foundation)
```

---

## 4. タスク 4: ai_usage_logs テーブル作成

### 4.1 migration

ファイル: `supabase/migrations/20260419200000_ai_usage_logs.sql` (64 行)

スキーマ要点:
- `venue_id`, `merchant_id` 共に NULLABLE (バックエンドバッチで NULL、ユーザー駆動で値あり)
- `feature` VARCHAR(50) NOT NULL: review_reply / sns_post / pop_image / monthly_comment / analyze_store_performance / collect_competitor_data / google_places_collect / google_reviews_collect 等
- `cost_usd` DECIMAL(10,6): 6 桁精度で計算済 USD コスト
- `status` CHECK 制約: success / error / rate_limited
- `metadata` JSONB: 各 EF 固有の追加情報
- 3 インデックス: `(venue_id, created_at DESC)`, `(merchant_id, created_at DESC)`, `(feature, created_at DESC)`
- RLS: authenticated は `staff_accounts.merchant_id` 経由、service_role 全アクセス

### 4.2 既存 EF への INSERT 追加

新規 helper: `supabase/functions/_shared/ai-usage-log.ts` (66 行)
- `logAiUsage(sbAdmin, params)` 関数: brand_id → merchant_id を自動解決、ベストエフォート INSERT、失敗時は console.error のみ

各 EF への適用:

| EF | 成功 INSERT | エラー INSERT | 特記 |
|---|---|---|---|
| generate-review-reply | ✅ tokens 記録 | ✅ error_message | venue_id を display_id 経由で解決 |
| generate-sns-post | ✅ + metadata: {platform, topic} | ✅ | 同上 |
| generate-pop-image | ✅ + cost_usd=0.04 | ✅ | DALL-E 3 standard 1024x1024 単価 |
| generate-monthly-comment | ✅ + metadata: {month} | ✅ | タスク 2.2 と統合 |
| analyze-store-performance | ✅ + metadata: {analysis_type} | ✅ | 新規 EF (タスク 3) |
| collect-competitor-data | ✅ バッチサマリ + cost_usd=$0.032×api_calls | ✅ | venue_id=NULL |
| google-places-background-collector | ✅ バッチサマリ + cost_usd=$0.032×requests | ✅ | venue_id=NULL, ward 別記録 |
| google-reviews-collector | ✅ バッチサマリ + cost_usd≒$0.017×api_estimate | ✅ | venue_id=NULL |

`monitor-usage` EF は対象外 (CC AI-A 報告書 6.16 の方針通り、自己ログ不要)。

### 4.3 管理マスタ Demo Fallback 削除 (D-83 違反解消)

ファイル: `weir-admin.html`

- `generateCostDemoData()` 関数を完全削除 (44 行削除)
- `let COST_LOGS = generateCostDemoData()` → `let COST_LOGS = []` に変更
- `_costDataSource = 'demo'` → `'empty'` に再定義 ('empty' | 'real')
- `loadRealCostLogs()` を新スキーマ (feature/cost_usd/merchant_id) に完全書換
- ftMap: `sns_post → sns_content`, `monthly_comment → monthly_ai_comment`, `analyze_store_performance → sales_analysis`, `collect_competitor_data → competitor_report` 等を再マッピング
- USD → JPY 換算: `cost_usd × 150` (POC 概算、将来的に為替 API 連動を検討)
- バッジ: 旧「デモデータ」→「📭 記録なし (ai_usage_logs 空 or 接続失敗)」

### 4.4 検証結果

| 項目 | 検証方法 | 結果 |
|---|---|---|
| migration 構文 | 目視 (DDL) | ✅ 構文 OK |
| 7 EF 全てに INSERT 追加 | Grep で `logAiUsage` または `ai_usage_logs` 直接 INSERT を確認 | ✅ 7/7 EF 追加 |
| Demo data 残存検索 | Grep `generateCostDemoData|COST_VENUES.forEach` | ✅ generateCostDemoData 削除確認、COST_VENUES は空配列のまま (UI 側に副次的影響なし) |
| 新 EF (analyze-store-performance) も対応 | logAiUsage 呼出確認 | ✅ |
| RLS staff_accounts.merchant_id | 既存 RLS パターンと比較 | ✅ 列名一貫 |

### 4.5 コミット

```
cf33ae1 feat(db): add ai_usage_logs table for cross-EF AI usage tracking
f7c5dd3 feat(ai): add ai_usage_logs INSERT to 7 AI EFs via shared helper
672796b fix(d83): remove demo data fallback from cost management page
```

---

## 5. タスク 5: crm_send_logs RLS バグ修正

### 5.1 修正内容

ファイル: `supabase/migrations/20260419300000_fix_crm_send_logs_rls.sql` (新規 24 行)

```sql
DROP POLICY IF EXISTS "authenticated_read_own_brand" ON crm_send_logs;

CREATE POLICY "authenticated_read_own_brand" ON crm_send_logs
  FOR SELECT TO authenticated
  USING (
    brand_id IN (
      SELECT brand_id FROM staff_accounts WHERE auth_user_id = auth.uid()
    )
  );
```

既存 migration ファイル (`20260406800000_crm_send_logs.sql`) は履歴透明性のため保持、新規 migration で上書き。

### 5.2 検証結果

| 項目 | 検証方法 | 結果 |
|---|---|---|
| 既存 staff_accounts スキーマ確認 | Grep で他 RLS の `auth_user_id` 使用箇所 | ✅ 30+ 箇所で `auth_user_id` を使用 (`auth_uid` は今回の 1 件のみ) |
| DROP POLICY IF EXISTS の安全性 | 存在しなくてもエラーにならない | ✅ |
| ロールバック手順 | 旧 policy を再 CREATE | ⚠️ 必要なら手動で `auth_uid = auth.uid()` 版を再作成可能 (推奨せず) |

### 5.3 コミット

```
41e8a86 fix(rls): correct crm_send_logs RLS policy column name
```

---

## 6. 検証の義務 (S-04) 報告

| 項目 | 検証方法 | 結果 |
|---|---|---|
| `generate-sns-content` 残存検索 | Grep | ✅ 0 件 (HTML 全ファイル) |
| migration ファイル 3 本作成 | ls | ✅ 20260419100000 / 20260419200000 / 20260419300000 |
| 新規 EF analyze-store-performance | ls | ✅ ファイル存在 |
| 既存 EF 7 件への logAiUsage 追加 | Grep `logAiUsage(sbAdmin` | ✅ 7 EF (generate-* × 4 + collect-* + google-* × 2) |
| ヘルパー _shared/ai-usage-log.ts 存在 | ls | ✅ |
| frontend 修正 3 箇所 | weir-customer-admin.html (snsGeneratePost / sdAiAnalysis / loadMonthlyAiComment) + weir-admin.html (loadRealCostLogs / Demo 削除) | ✅ 全て git diff で確認 |
| escH() XSS 対策 | 全表示箇所 | ✅ |
| 9 コミット git log | git log --oneline | ✅ e6186ea→672796b |
| Deno syntax check | **検証不可** (Deno 未インストール) | ❌ ローカル不可、Tasei deploy 時に確認 |
| ブラウザ実動作 | **検証不可** (本番 deploy 必要) | ❌ |
| Supabase migration 実行 | **検証不可** (本番接続禁止 + ローカル psql なし) | ❌ Tasei 実行待ち |
| 本番 EF 動作テスト | **検証不可** (本番 API 実行禁止) | ❌ |
| RLS 実効性検証 | **検証不可** (実 auth ユーザーで SELECT 必要) | ❌ Tasei 確認待ち |

**未検証項目を「確認済」と主張しない**: 上記 5 項目は本依頼スコープ内で検証不可、Tasei 作業 or 次フェーズ検証待ち。

---

## 7. Tasei 実行手順書

### 7.1 Supabase SQL ダッシュボードで実行する migration (順番)

> URL: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz/sql

1. **`20260419100000_ai_monthly_comments.sql`** (3 分)
   - 影響: 新規テーブル + 2 インデックス + 2 RLS policy
   - 確認: `SELECT to_regclass('public.ai_monthly_comments') IS NOT NULL;` → `t`

2. **`20260419200000_ai_usage_logs.sql`** (3 分)
   - 影響: 新規テーブル + 3 インデックス + 2 RLS policy
   - 確認: `SELECT to_regclass('public.ai_usage_logs') IS NOT NULL;` → `t`

3. **`20260419300000_fix_crm_send_logs_rls.sql`** (1 分)
   - 影響: 既存 RLS policy DROP → CREATE (列名修正のみ)
   - 確認: `SELECT polname FROM pg_policy WHERE polrelid = 'crm_send_logs'::regclass;` で `authenticated_read_own_brand` が存在

### 7.2 Supabase Dashboard > Edge Functions で deploy する EF (順番)

> URL: https://supabase.com/dashboard/project/iikwusprydaogzeslgdz/functions

**前提**: ローカルに Supabase CLI が入っているなら以下が最速:
```bash
supabase functions deploy analyze-store-performance
supabase functions deploy generate-monthly-comment
supabase functions deploy generate-review-reply
supabase functions deploy generate-sns-post
supabase functions deploy generate-pop-image
supabase functions deploy collect-competitor-data
supabase functions deploy google-places-background-collector
supabase functions deploy google-reviews-collector
```

または並列実行:
```bash
for ef in analyze-store-performance generate-monthly-comment generate-review-reply generate-sns-post generate-pop-image collect-competitor-data google-places-background-collector google-reviews-collector; do
  supabase functions deploy $ef &
done
wait
```

deploy 後の確認:
- Dashboard で 8 EF 全てが「Deployed」状態
- `analyze-store-performance` の logs を 1 件確認 (空 invoke でも 400 が返ればデプロイ完了)

### 7.3 Vercel 自動 deploy 対象のブランチ戦略

CLAUDE.md 記載通り Vercel auto-integration は壊れている可能性。確実にしたい場合:
```bash
cd /Users/taisei/Desktop/weir
vercel --prod
```

(ただし `weir-customer-admin.html` と `weir-admin.html` の変更は静的ファイルのため、deploy しなくとも `xorder.co.jp/weir-customer-admin.html` の次回アクセス時にブラウザキャッシュ更新で反映される可能性あり)

### 7.4 Push 確認

local main に 9 コミット (e6186ea → 672796b)。Tasei レビュー後:
```bash
git push origin main
```

---

## 8. 残課題 (本依頼スコープ外、次依頼へ)

| # | 項目 | 推奨依頼先 | 工数 |
|---|---|---|---|
| 1 | 20 種類 AI 売上分析 残り 19 種類実装 | CC AI-C | 3-4 週間 |
| 2 | SNS 画像生成 (`snsGenerateImage()`) DALL-E 統合 | CC AI-C | 半日〜1 日 |
| 3 | 近隣店舗 AI 比較評価 (`compare-with-competitors` EF) | CC AI-C | 1-2 週間 |
| 4 | AI CRM 分析 6 種の DB 動的化 (`AICRM_DATA` ハードコード解消) | CC AI-C | 1-2 週間 |
| 5 | LINE Messaging API 実送信 (`send-line-broadcast` EF) | 別依頼 | 1 週間 |
| 6 | メルマガ生成 EF + UI 統合 | 別依頼 | 1-2 週間 |
| 7 | aiden-pos AI チャット応答 ロジック実装 | 別依頼 | 3-5 日 |
| 8 | analyze-store-performance クォータ専用キー追加 (`STD_LIMITS.analyze_store_performance`) | CC AI-C 同梱 | 数時間 |
| 9 | USD → JPY 為替 API 連動 (現状は 150 円固定) | 別依頼 | 1 日 |
| 10 | merchant_id への brand_id 経由解決を helper 化 | リファクタ | 数時間 |

---

## 9. スコープ外 (実施しなかったこと、明示)

- ❌ **本番 DB への migration 実行** (Tasei 作業、S-05 スコープ制限)
- ❌ **本番 EF deploy** (同上)
- ❌ **AI 機能のブラウザ実動作テスト** (本番 deploy 後でないと不可)
- ❌ **20 種類分析の残り 19 種類実装** (CC AI-C スコープ)
- ❌ **SNS 画像生成 / 近隣比較 / AI CRM DB 化** (P1 重要だが本依頼スコープ外)
- ❌ **既存 EF コードの全面リファクタ** (タスク 4.2 で必要箇所のみ helper 化)
- ❌ **本番 staff_accounts スキーマ確認** (auth_user_id 列存在は migration 履歴で 30+ 箇所確認、Tasei が本番テーブルでも同一であることを最終確定)
- ❌ **`.env.local` の LINE 関連改行汚染修正** (Tasei 手動作業、CC ENV-A スコープ)
- ❌ **環境変数 (ANTHROPIC_API_KEY 等) の本番設定確認** (Tasei Dashboard 手動)
- ❌ **D-83 違反の他箇所 (`AICRM_DATA` 等) の解消** (本依頼は ai_usage_logs Demo 削除のみ、残りは次依頼)

---

## 📎 付録: コミット一覧

```
672796b fix(d83): remove demo data fallback from cost management page
614f09f feat(ai): rewrite loadMonthlyAiComment for cache + on-demand generation (P0-B)
f7c5dd3 feat(ai): add ai_usage_logs INSERT to 7 AI EFs via shared helper
1f35c80 feat(ai): add analyze-store-performance EF skeleton with daily analysis (P0-C foundation)
66ce473 feat(ai): write monthly comment to ai_monthly_comments cache + ai_usage_logs
cf33ae1 feat(db): add ai_usage_logs table for cross-EF AI usage tracking
d65aec3 feat(db): add ai_monthly_comments table for cached monthly AI comments
41e8a86 fix(rls): correct crm_send_logs RLS policy column name
e6186ea fix(ai): correct SNS post EF name and request format (P0-A)
```

合計 9 コミット、ベース 937eb82 → 672796b。

---

## 📎 付録: 変更ファイル統計

| ファイル | 変更種別 | 行数 |
|---|---|---|
| `supabase/migrations/20260419100000_ai_monthly_comments.sql` | 新規 | 54 |
| `supabase/migrations/20260419200000_ai_usage_logs.sql` | 新規 | 64 |
| `supabase/migrations/20260419300000_fix_crm_send_logs_rls.sql` | 新規 | 24 |
| `supabase/functions/_shared/ai-usage-log.ts` | 新規 | 66 |
| `supabase/functions/analyze-store-performance/index.ts` | 新規 | 280+ |
| `supabase/functions/generate-monthly-comment/index.ts` | 修正 | +60 |
| `supabase/functions/generate-review-reply/index.ts` | 修正 | +35 |
| `supabase/functions/generate-sns-post/index.ts` | 修正 | +37 |
| `supabase/functions/generate-pop-image/index.ts` | 修正 | +33 |
| `supabase/functions/collect-competitor-data/index.ts` | 修正 | +37 |
| `supabase/functions/google-places-background-collector/index.ts` | 修正 | +33 |
| `supabase/functions/google-reviews-collector/index.ts` | 修正 | +38 |
| `weir-customer-admin.html` | 修正 (3 関数) | +110 -29 |
| `weir-admin.html` | 修正 (D-83 削除 + loader 書換) | +51 -54 |

**合計**: 14 ファイル、新規 5 + 修正 9、約 850 行追加 / 90 行削除

---

**実装完了**: 2026-04-19
**実装者**: Claude Code (Opus 4.7)
**成果物保存先**: `/Users/taisei/Desktop/weir/cc-requests/CC_AI-B_report_20260419.md`
**次依頼**: CC AI-C (20 分析の残り 19 種類 + P1 重要 4 項目)
