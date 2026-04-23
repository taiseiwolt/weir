# CC-Option-Master-Stage1 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Follow CC 依頼文 (`cc-option-master-stage1` spec) as authoritative.

**Goal:** D-242 採用確定のオプションマスタ案 β の DB 基盤 + 管理マスタ UI + bulk-import テンプレ拡張を本番リリースする（Stage 1 スコープ）。

**Architecture:** 4 新規テーブル（option_groups / options / product_option_groups / option_sale_status）+ `weir-admin.html` に「オプション管理」nav item 追加 + `api/bulk-import` に 3 新型 + `menu_full` テンプレに 3 シート追加。既存 products / menu_patterns / bulk-import パターン踏襲、Stage 2（ブランドページ / 受注アプリ / Stripe / 品切れ UI）には触れない。

**Tech Stack:** Supabase PostgreSQL 15 / Vanilla JS + Supabase JS v2 / xlsx 0.18.5 / Node.js Serverless (Vercel)

---

## CC 技術判断サマリ（TL-26）

| 論点 | 採用 | 理由 |
|---|---|---|
| PK 命名 | spec 通り `group_id` / `option_id` | 中間テーブル / sale_status の FK 自己文書化 |
| price_delta 型 | `int`（products.price 同型） | 通貨 0 円〜数千円の整数で十分 |
| RLS パターン | products を踏襲（anon SELECT / authenticated: staff_accounts 経由 / service_role ALL） | 既存 products と同じ capability、オンボ受注で anon 必要 |
| admin UI カラー | 既存 `--accent:#6c5ce7` 紫を維持 | 既存 admin は紫基調（D-205 青は onboarding/order-* 限定）、admin 全体刷新は別 CC |
| option_sale_status.status | spec 通り `available` / `sold_out_today` / `discontinued` | option は products.sale_status と意味が異なる |
| bulk-import 構造 | 3 個別型 + menu_full 拡張シート | 既存 menu_category / menu_product / menu_size と同じ |
| Realtime publication | 不採用 | admin UI は refetch で十分、realtime 不要 |
| updated_at trigger | 既存 `update_updated_at_column()` 関数再利用 | option_groups / options / option_sale_status の 3 テーブルに設定、product_option_groups は updated_at カラムなし（spec 通り） |

---

## File Structure

- **Create**
  - `supabase/migrations/20260424100000_option_master_stage1.sql` — 4 テーブル + RLS + triggers + rollback
  - `docs/cc-option-master-stage1-execution-guide.md` — Taisei が Dashboard で本番実行する手順書
  - `docs/cc-option-master-stage1-smoke-test.md` — 本番 Smoke test 7 項目の実機確認手順
- **Modify**
  - `weir-admin.html` — nav item + renderOptionsPage + CRUD 関数 + 商品編集モーダル拡張 + BULK_TEMPLATES 3 型追加 + menu_full sheets 3 個追加 + handleBulkFile sheet auto-detect 拡張
  - `api/bulk-import/[...path].js` — TYPE_CONFIG に 3 型追加 + resolveRefs / upsertLookup / buildPayload / exportQuery 各 3 個追加 + PRODUCT_FLAGS との整合確認
- **Untouched (scope S-05)**
  - brand HP / receiving app / Stripe / 品切れ管理 UI は一切触れない
  - 既存 products / menu_patterns / bulk-import 既存機能のリファクタリング禁止

---

## Task 1: DB Migration 作成 + staging 実行

**Files:**
- Create: `supabase/migrations/20260424100000_option_master_stage1.sql`

- [ ] **Step 1.1: Migration 本体作成**（spec Table 1-4 を完全 SQL で実装）
- [ ] **Step 1.2: RLS 5 ポリシー × 4 テーブル = 20 ポリシー定義**（products/menu_patterns パターン踏襲）
- [ ] **Step 1.3: updated_at trigger を 3 テーブルに設定**（product_option_groups は updated_at カラム不要）
- [ ] **Step 1.4: ロールバック SQL 末尾にコメント添付**
- [ ] **Step 1.5: bash -n で SQL 構文チェック**（psql clientless 形式の簡易チェック）
- [ ] **Step 1.6: staging (weir-dev `lvslpubjlemonsiobifr`) で実行予定** — 本件は staging DB 直接接続情報なし、Taisei が本番 Dashboard で実行するため docs/execution-guide で代替

---

## Task 2: weir-admin.html オプション管理 UI 追加

**Files:**
- Modify: `weir-admin.html` (sidebar L117-131 / renderPage switch L576-600 / 新規関数 L1500 付近挿入 / 既存商品編集モーダル拡張 L1275-1479)

- [ ] **Step 2.1: サイドバー nav item 追加**（L122 「メニュー管理」の直下に「オプション管理」挿入）
- [ ] **Step 2.2: renderPage switch 分岐追加**（L584 付近 `menus` 分岐の直下に `options` 分岐）
- [ ] **Step 2.3: renderOptionsPage() + initOptionsPage() 実装**（メニュー管理 L839-859 パターン踏襲、display_id 検索 UI）
- [ ] **Step 2.4: optionsLoadBrand() + 3 ペイン描画**（左: グループ一覧 / 中央: 選択肢一覧 / 右: 商品紐付け）
- [ ] **Step 2.5: グループ CRUD モーダル**（add / edit / delete、selection_type single/multiple + is_required + sort_order）
- [ ] **Step 2.6: 選択肢 CRUD モーダル**（name / price_delta / is_default / is_available / sort_order）
- [ ] **Step 2.7: 商品編集モーダル拡張**（既存 `_renderMenusProductModal` L1275 にオプショングループ選択 section 追加、is_required NULL / true / false ラジオ）
- [ ] **Step 2.8: 保存時の product_option_groups CRUD 実装**（商品保存フローに UPSERT / DELETE 追加）
- [ ] **Step 2.9: logAudit + showToast 全操作統合**（既存パターン踏襲）
- [ ] **Step 2.10: D-83 ハードコード禁止遵守確認**（空状態は renderEmptyState で文言制御）

---

## Task 3: bulk-import 3 シート拡張

**Files:**
- Modify: `weir-admin.html` (BULK_TEMPLATES L5185-5300 / downloadBulkTemplate L5996-6108 / handleBulkFile L6110-6149 / parsedToPreview L6160)
- Modify: `api/bulk-import/[...path].js` (TYPE_CONFIG L11-60 / resolve* / lookup* / buildPayload L692-750)

- [ ] **Step 3.1: BULK_TEMPLATES に `option_group` / `option` / `product_option_group` 3 型追加**（xlsx format、headers / keys / sample / dvDefs）
- [ ] **Step 3.2: menu_full.sheets に 3 新規シート追加**（`3_オプショングループ` / `4_オプション` / `5_商品オプション関連付け`）
- [ ] **Step 3.3: handleBulkFile sheet auto-detect 拡張**（L6135-6142 に新規 3 分岐追加）
- [ ] **Step 3.4: api TYPE_CONFIG に 3 型追加**（table / requiredFields / upsertLookup / resolveRefs / exportQuery）
- [ ] **Step 3.5: resolveOptionGroupRefs / resolveOptionRefs / resolveProductOptionGroupRefs 実装**（brand_slug / group_name / product_name lookup）
- [ ] **Step 3.6: lookupOptionGroup / lookupOption / lookupProductOptionGroup 実装**（composite key: brand+name / group+name / product+group）
- [ ] **Step 3.7: buildPayload に 3 分岐追加**（pick で必要カラムのみ）
- [ ] **Step 3.8: exportOptionGroups / exportOptions / exportProductOptionGroups 実装**（brand_slug / group_name / product_name の reverse lookup）
- [ ] **Step 3.9: 投入順序制約を docs に明記**（option_group → option → product_option_group）

---

## Task 4: 本番反映 + docs + Smoke test

**Files:**
- Create: `docs/cc-option-master-stage1-execution-guide.md` — 本番 Dashboard 実行ガイド
- Create: `docs/cc-option-master-stage1-smoke-test.md` — 7 項目 Smoke test

- [ ] **Step 4.1: `npm run lint` 実行**（console.log 残存 / 既知ブランド名 harde-coded 検知）
- [ ] **Step 4.2: git add + commit + push**（1 commit/task で 4 commits 目安）
- [ ] **Step 4.3: Vercel 自動 deploy 確認**（`vercel ls` or 手動 `vercel --prod`）
- [ ] **Step 4.4: 実行ガイド docs 生成**（完全 SQL + 確認クエリ + トラブルシューティング）
- [ ] **Step 4.5: Smoke test docs 生成**（7 項目の完全手順 + 期待結果 + DB 確認 SQL）
- [ ] **Step 4.6: Taisei 依頼事項の明示**（⚠️ 手動作業: 本番 Dashboard SQL 実行 + Smoke test 実機確認）

---

## 受入基準 → Task マッピング

- Task 1 受入基準: Step 1.1-1.6 で 6 項目達成
- Task 2 受入基準: Step 2.1-2.10 で 4 項目達成
- Task 3 受入基準: Step 3.1-3.9 で 4 項目達成
- Task 4 受入基準: Step 4.1-4.6 で 4 項目達成 + Taisei 実機確認で 7/7 PASS

---

## Self-Review (writing-plans 必須)

### Spec coverage
- Task 1: 4 テーブル / RLS / trigger / rollback → 完全網羅
- Task 2: オプショングループ管理 + 選択肢管理 + 商品紐付け → 完全網羅
- Task 3: 3 シート拡張 + バリデーション + 投入順序 → 完全網羅
- Task 4: 本番反映 + docs + Smoke test → 完全網羅

### Placeholder scan
- "適切に対応" / "TBD" / "実装予定" / "similar to Task N" → なし

### Type consistency
- option_groups.group_id (PK) → options.group_id (FK) → product_option_groups.group_id (FK): 一致
- options.option_id (PK) → product_option_groups.*_id (FK 無) → option_sale_status.option_id (FK): 一致
- product_option_groups.is_required: NULLABLE 一貫
- brand_id / venue_id / product_id: brands.id / venues.id / products.id への FK 一致
