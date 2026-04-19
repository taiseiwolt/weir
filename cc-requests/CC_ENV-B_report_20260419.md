# CC ENV-B 完了報告書: ENV 分離 Phase B 実構築

> 担当: ENV-B セッション
> 完了日: 2026-04-19 JST
> ベースブランチ: feature/cc-env-b (作業用、origin/main 937eb82 にリベース予定)
> 入力: cc-requests/CC_ENV-A_report_20260419.md (102 テーブル分類 + 19 環境変数棚卸し)
> スコープ: 実装 + コミット。本番/STG への反映は Tasei 手動実施

---

## ⚠️ 手動作業リスト (Tasei 必須、10 項目)

本依頼は「実装 + コミット」までが CC の責務。以下 10 項目は Tasei が手動実施する必要がある。並列可能なものはマーク付き。

| # | 作業 | 所要 | 前提 | 並列可 |
|---|---|---|---|---|
| 1 | Supabase `weir-dev` プロジェクト新規作成 | 15 分 | — | ○ (2 と並列) |
| 2 | Vercel Custom Environment `staging` 作成 | 10 分 | — | ○ (1 と並列) |
| 3 | Custom Domain `dev.xorder.co.jp` 設定 + DNS | 15 分 | #1, #2 完了後 | × |
| 4 | STG 環境変数 19 件を Vercel + Supabase EF に投入 | 30-45 分 | #1, #3 完了後 | × |
| 5 | Stripe Test Mode の Connect test account 作成 + Webhook 登録 | 30-60 分 | #4 完了後 | ○ (6, 7 と並列) |
| 6 | LINE Developers Console で STG Channel 新規作成 | 15 分 | #3 完了後 | ○ (5, 7 と並列) |
| 7 | Resend に `dev.weir.co.jp` verified domain 追加 + STG API key 発行 | 15 分 | — | ○ (5, 6 と並列) |
| 8 | GitHub Secrets 9 件設定 | 10 分 | #1, #5, #6, #7 完了後 | × |
| 9 | GitHub Environment Protection `production` 設定 | 5 分 | — | ○ (10 と並列) |
| 10 | main / staging ブランチ保護ルール設定 | 10 分 | feature/cc-env-b の PR マージ後 | ○ (9 と並列) |

**合計 2-3 時間。#5-7 は並列で実施可能なので実質 1.5-2 時間に圧縮可能。**

詳細手順は §4-A に集約。

---

## ✨ 重要発見サマリー

### 発見 1: staging ブランチは feature/cc-env-b の PR マージ後に作成するのが安全
CC 側で `git branch staging main` で作成済だが、feature/cc-env-b を PR 経由で main にマージした後、**Tasei が最新 main から staging を切り直す**のが本流運用として望ましい。本コミットに含まれる `git branch staging main` の結果（ローカル branch）は参考実装として残す。

### 発見 2: notify-email は composite action として実装、reusable workflow ではない
CC 依頼書では `.github/workflows/notify-email.yml` を reusable workflow として想定していたが、step 単位で呼び出せる composite action (`.github/actions/notify-email/action.yml`) として実装した。理由: reusable workflow は job 単位でしか呼べず、失敗通知のためだけに追加 job を作ると GitHub Actions の job startup (~30 秒) が毎回追加で発生し非効率。composite action は step として組み込めるため各 workflow の終盤で条件付き通知が可能。

### 発見 3: playwright.config.cjs に baseURL 設定がない
現状の `playwright.config.cjs` (13 行) には `use.baseURL` が未設定。GHA-02 で `BASE_URL=https://dev.xorder.co.jp` を env 経由で渡しているが、テスト側 (`e2e-*.spec.cjs`) で `process.env.BASE_URL` を参照していなければ効かない。STG での初回 playwright 実行時に URL が固定値 (xorder.co.jp など) で走ってしまうリスクあり。**Phase C (CC ENV-C) で `playwright.config.cjs` に `use.baseURL = process.env.BASE_URL || 'http://localhost'` を追加する修正が必要**。

### 発見 4: dependabot の target-branch を staging に設定
Dependabot の PR が main を直撃すると branch 保護ルール (PR 1 approval 必須) でブロックされる。`target-branch: staging` にして staging への PR として開かせることで、staging-playwright workflow が Dependabot PR の実地検証を担う設計とした。これは CC 依頼書に明示されていなかった追加判断。

### 発見 5: local main が origin/main より 10 commits 先行
本セッション開始時、local main は `e2e4fef` で origin/main (`937eb82`) より 10 commits 進んでいた。これは他 CC セッション (AI-A, AI-B 等) が local 作業した未 push 分の commit 群。CC ENV-B の commit は origin/main (937eb82) にリベース後 push することで、本 PR には ENV-B の変更のみが含まれる状態にする。

---

## 1. タスク 1: DB 移行 SQL 作成

成果物は `supabase/migrations-stg/` 配下 4 ファイル:

| ファイル | 役割 |
|---|---|
| `stg_001_master_data_export.sh` | マスタ 45 テーブル (44 マスタ + review_alerts) の data-only pg_dump + STG への load + sequence SETVAL |
| `stg_002_stripe_id_sanitization.sql` | merchants/venues/members/orders/payments/refunds の Stripe live ID を NULL に強制 |
| `stg_003_schema_only_tables.sh` | フォールバック用。tx 46 + VIEW 5 + 境界空扱い 5 = 56 オブジェクトの schema-only pg_dump |
| `README.md` | 実行フローと検証クエリ |

### 1-A: マスタデータエクスポートスクリプト

**対象テーブル (45 件):**
- CC_ENV-A 報告書タスク 1 で「本番→STG コピー」とした 44 マスタ
- 境界判断の 1 件 `review_alerts` (メモ: "マスタ扱いで OK")

**スクリプトの安全ガード:**
1. `PROD_DB_URL` / `STG_DB_URL` の未設定で早期 exit
2. 両 URL が同一の場合に exit (自己参照防止)
3. `STG_DB_URL` が本番 project ref `iikwusprydaogzeslgdz` を含む場合に exit (本番誤書き込み防止)
4. `psql --single-transaction` でロード全体を 1 transaction にラップ (部分適用防止)
5. ロード後に全 serial sequence を `setval(MAX(col))` で同期 (INSERT 時のキー衝突防止)

**除外カラム/処理なし** — PII (brands.contact_email, merchants.bank_account_number 等) はそのまま本番値でコピーされる。STG でのテストメール流出リスクは **stg_002 Stripe 無効化のみ対応済**。連絡先メールの dummy 置換は未実装 (判断保留、§6 残課題参照)。

### 1-B: 境界判断 6 件の扱い

CC_ENV-A の境界判断 6 件について本セッションで確定:

| テーブル | 判断 | 処理先 |
|---|---|---|
| `accounts` | 空で開始 (旧認証テーブル、D-136 4 分離未統合) | stg_003 schema-only |
| `device_tokens` | 空で開始 (FCM token は PII) | stg_003 schema-only |
| `monitoring_alerts` | 空で開始 (履歴テーブル) | stg_003 schema-only |
| `review_alerts` | **マスタ扱いでコピー** | stg_001 data-only |
| `sns_connections` | 空で開始 (OAuth token コピー禁止) | stg_003 schema-only |
| `staff_accounts` | 空で開始 (運用者 PII) | stg_003 schema-only |

→ 46 tx + 5 boundary-empty = 51 空テーブル、44 マスタ + 1 境界→マスタ = 45 コピー、5 VIEW = 計 **101 オブジェクト**。102 - corps = 一致。

### 1-C: 廃止予定 1 件 (corps) の扱い

- `corps` は D-92 で merchants へ統合済、本番に 6 行残骸
- weir-dev には**最初から作成しない** (migration 履歴には CREATE TABLE corps が存在しないはず / 要確認)
- 本番の `DROP TABLE corps` は本依頼スコープ外 (別途 CC ENV-C で Tasei 承認後に実施)

---

## 2. タスク 2: ブランチ戦略切替

### 2-A: staging ブランチ作成

ローカルで以下を実施:

```bash
git checkout -b feature/cc-env-b   # 本セッションの作業用ブランチ (main から)
# ... 実装 + コミット ...
git branch staging main            # main の HEAD に staging pointer を作成
```

作業中の確認:
```
* feature/cc-env-b    (作業中、本 commit 追加される予定)
  main                (参照、ahead of origin/main 10 commits)
  staging             (main と同じ HEAD)
```

**push 手順** (final commit step で実行):

```bash
# 1. origin/main に対してリベースして commit を純粋な ENV-B 作業のみにする
git fetch origin main
git rebase origin/main   # feature/cc-env-b の HEAD を origin/main (937eb82) 上に再配置

# 2. feature/cc-env-b を push
git push -u origin feature/cc-env-b

# 3. staging を origin にも作成 (origin/main 最新から)
git push origin main:staging
```

### 2-B: ブランチ保護ルール設定手順書

**Tasei 手動** (GitHub Repository Settings > Branches > Add rule):

#### main 保護ルール

1. Branch name pattern: `main`
2. 以下にチェック:
   - ✅ Require a pull request before merging
     - ✅ Require approvals: **1** (Tasei)
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - Required status checks:
       - `checks` (= pr-checks job)
       - `playwright` (= staging-playwright job、staging branch via PR に限る)
   - ✅ Require conversation resolution before merging
   - ✅ Include administrators
   - ✅ Restrict pushes that create matching branches
3. Save

#### staging 保護ルール

1. Branch name pattern: `staging`
2. 以下にチェック:
   - ✅ Require a pull request before merging
     - ✅ Require approvals: **1** (Tasei)
   - ✅ Require status checks to pass before merging
     - Required status checks:
       - `checks`
3. Save

**注**: staging のルールは main より緩い。e2e / playwright は staging push 時に実行する設計のため staging 上で要件化しない。

---

## 3. タスク 3: GHA Workflow 実装

`.github/` 配下に以下を作成:

| # | パス | 種別 | トリガー |
|---|---|---|---|
| GHA-01 | `.github/workflows/pr-checks.yml` | workflow | PR → staging / main |
| GHA-02 | `.github/workflows/staging-playwright.yml` | workflow | push staging |
| GHA-03 | `.github/workflows/staging-migration.yml` | workflow | push staging + migrations/** |
| GHA-04 | `.github/workflows/production-migration.yml` | workflow | push main + migrations/** |
| GHA-05 | `.github/workflows/firecrawl-scan.yml` | workflow | deployment_status success (Production) |
| GHA-06 | `.github/dependabot.yml` | config | 週次 (月曜 09:00 JST) |
| GHA-07 | — | Vercel 既存機能 (設定確認のみ、下記参照) | — |
| GHA-08 | `.github/actions/notify-email/action.yml` | composite action | 他 workflow の failure step から呼出 |

### 3-1: GHA-01 pr-checks.yml

- Node 20 + npm ci
- `npm run lint` (package.json 既存、console.log / D-83 固有名詞 grep)
- concurrency group で同一 PR の古い run を自動 cancel
- e2e は PR では実行しない (重いため staging push 後の GHA-02 に集約)

### 3-2: GHA-02 staging-playwright.yml

- Vercel 自動デプロイ完了待ち (`sleep 120`、Phase C で deployment watcher に置換推奨)
- `BASE_URL=https://dev.xorder.co.jp` を env で渡す
- 失敗時: `playwright-report/` を artifact (14 日保持) + notify-email で通知
- **前提**: テスト側で `process.env.BASE_URL` を参照している必要あり (未対応なら §発見 3 の追加修正が必要)

### 3-3: GHA-03 staging-migration.yml

- `paths: ['supabase/migrations/**']` で migration 変更時のみ発火
- `supabase/setup-cli@v1` で Supabase CLI インストール
- `supabase link` + `supabase db push --linked -p $PASSWORD` で weir-dev に適用
- concurrency group `staging-migration`、`cancel-in-progress: false` で直列実行保証

### 3-4: GHA-04 production-migration.yml

- `environment: production` で approval gate (Tasei 承認待ち)
- 本番 project ref と password は別 secret (`SUPABASE_PRODUCTION_*`)
- `if: always()` で成功・失敗両方通知

### 3-5: GHA-05 firecrawl-scan.yml

- `deployment_status` event + `environment == 'Production'` + `state == 'success'` で発火
- `FIRECRAWL_API_KEY` で `.github/scripts/firecrawl-scan.js` を実行
- 6 URL のスキャン結果をチェック、placeholder 残存を検知したら失敗

**スキャン対象 URL**:
```
https://xorder.co.jp/izakaya-ushio
https://xorder.co.jp/izakaya-ushio/ra6dxdh
https://xorder.co.jp/izakaya-ushio/ra6dxdh/order
https://xorder.co.jp/izakaya-ushio/mypage
https://xorder.co.jp/legal/terms
https://xorder.co.jp/izakaya-ushio/ra6dxdh/checkout
```

**検知するマーカー** (`.github/scripts/firecrawl-scan.js` の `FORBIDDEN_MARKERS` 配列):
- `Lorem ipsum`
- `TBD`, `TODO`
- `placeholder-text`
- `サンプルテキスト`
- `テスト店舗`, `テストユーザー`
- `ダミー`

**注**: 広すぎる「テスト」単独は誤検知するため除外 (正当な UI copy にも出現する可能性)。

### 3-6: GHA-06 dependabot.yml

- npm + github-actions の 2 ecosystem
- 週次 (月曜 09:00 JST)
- major 更新は `version-update:semver-major` で ignore (手動)
- **`target-branch: staging`** に設定 → main branch 保護ルールの PR 必須を回避し、staging 経由でマージ

### 3-7: GHA-07 Vercel Preview

既存機能。追加実装不要。設定確認ポイント:
- Vercel Dashboard > Settings > Git > Preview Branches = All branches (default)
- Preview 環境で使う env = staging と同一 (weir-dev Supabase + Stripe test mode)
- feature/* branch の push 時に自動で Preview URL 発行

### 3-8: GHA-08 notify-email (composite action)

`.github/actions/notify-email/action.yml`:
- `inputs`: `subject`, `body`
- `env` (secrets 経由): `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO`
- 実装: `jq` で JSON 生成 + Resend API に POST
- 失敗時は API response body を stderr に出力、exit 1

**reusable workflow ではなく composite action を選択**:
reusable workflow (`on: workflow_call`) は job 単位での呼出のみ可能。通知のためだけに専用 job を作ると job startup overhead が 30 秒 × N workflow 発生する。composite action なら既存 workflow の step として組み込め、オーバーヘッドほぼゼロ。

### 3-9: GitHub Secrets 設定手順 (Tasei 手動、§4-A タスク 8)

GitHub Repository Settings > Secrets and variables > Actions に以下 9 件を登録:

| Secret | 値の取得元 | 備考 |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | CC_ENV-A 既存: `sbp_81a590f...` | expires 2026-06-20、期限前に更新 |
| `SUPABASE_STAGING_PROJECT_REF` | weir-dev 作成後の Dashboard URL (§4-A タスク 1) | `xxxx.supabase.co` の `xxxx` 部分 |
| `SUPABASE_STAGING_DB_PASSWORD` | weir-dev 作成時に Tasei が設定した値 | 記録必須 |
| `SUPABASE_PRODUCTION_PROJECT_REF` | `iikwusprydaogzeslgdz` | 固定 |
| `SUPABASE_PRODUCTION_DB_PASSWORD` | 本番 Supabase Dashboard > Settings > Database > Connection string の password | |
| `FIRECRAWL_API_KEY` | 既存 Vercel env 変数と同値 | Vercel Dashboard で確認 |
| `RESEND_API_KEY` | 本番 Resend API key (CC_ENV-A digest `4f84da91...`) | — |
| `EMAIL_FROM` | `noreply@weir.co.jp` 推奨 | Resend verified domain 必須 |
| `EMAIL_TO` | `taisei@weir.co.jp` | 通知先 |

---

## 4. タスク 4: 各種手順書

### 4-A: Tasei 実行手順書 統合版 (10 項目)

> **実施タイミングの目安**: feature/cc-env-b PR マージ**後**に実施するのが理想。ただし #1-2 (Supabase/Vercel 作成) は PR と並行で先行着手可。

#### タスク 1: Supabase `weir-dev` プロジェクト作成 (15 分)

1. https://supabase.com/dashboard にログイン
2. Organization `taiseiwolt` を選択 (本番と同じ)
3. `New project` をクリック
4. 以下を入力:
   - Name: `weir-dev`
   - Database Password: **ランダム強力パスワード** (password manager に保存、後で `SUPABASE_STAGING_DB_PASSWORD` secret に使用)
   - Region: `Northeast Asia (Tokyo)`
   - Plan: **Pro** (+$25/月)
5. `Create new project` をクリック、provisioning 完了 (2-3 分) を待つ
6. URL の `https://app.supabase.com/project/<xxxx>` の `<xxxx>` 部分を記録 (後で `SUPABASE_STAGING_PROJECT_REF` secret に使用)

#### タスク 2: Vercel Custom Environment `staging` 作成 (10 分)

1. https://vercel.com/dashboard > Project `weir` を選択
2. Settings > Environments
3. `Add Environment` をクリック
4. 以下を入力:
   - Name: `staging`
   - Branch: `staging` (タイプしたらサジェストされる)
   - Domain は後で #3 で設定
5. Save

#### タスク 3: Custom Domain `dev.xorder.co.jp` 設定 (15 分)

1. Vercel Dashboard > Project `weir` > Settings > Domains
2. `Add Domain` で `dev.xorder.co.jp` 入力
3. Environment: **staging** を選択
4. 表示される CNAME target (`cname.vercel-dns.com`) を控える
5. DNS 管理 (Cloudflare 等) で `dev.xorder.co.jp` に CNAME `cname.vercel-dns.com` を追加
6. DNS 伝搬 (5-10 分) 後、Vercel で SSL 発行完了を確認
7. https://dev.xorder.co.jp を実ブラウザで開いて 404 でないこと確認 (staging に push がまだないので staging branch のコード or Vercel default ページが出るはず)

#### タスク 4: STG 環境変数 19 件を投入 (30-45 分)

> **重要**: Vercel Dashboard で環境変数を入力する際、**値末尾で Enter キーを押さない**こと。`\n` が文字列リテラルに混入し、D-175 / PF-7 教訓の汚染が再発する。
>
> コピー元テキストの末尾改行もチェック: `cat -vet` 相当の確認 (Vercel 入力後に Edit すると値表示に改行が見える)。

投入先は §4-B の表を参照。

**Vercel** (Dashboard > Settings > Environment Variables):
- 各変数について Environment = **staging** のみにチェック、Production / Preview / Development は触らない (本番値を STG 値で上書きしないため)
- Save 後に Edit モードで開き直して値が正しいこと確認

**Supabase EF Secrets** (weir-dev project):
```bash
# Tasei のローカル環境で
supabase link --project-ref <weir-dev-ref> -p <password>

# 各 secret を 1 件ずつ set
supabase secrets set SUPABASE_URL="https://<weir-dev-ref>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<新 eyJ...>"
supabase secrets set STRIPE_SECRET_KEY="sk_test_..."
supabase secrets set FRONTEND_URL="https://dev.xorder.co.jp"
# ... 以下 §4-B 参照
```

**投入後の検証**:
```bash
supabase secrets list  # digest が変わったことを確認
```

#### タスク 5: Stripe Test Mode Connect test account 作成 (30-60 分)

1. https://dashboard.stripe.com にログイン
2. 右上の **Test mode** トグルを ON (背景がオレンジに)
3. Developers > API keys で以下をコピー:
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`
4. Connect > Connected accounts (Test mode)
   - `+ Create` で新規 account 作成
   - Type: **Express**
   - 居酒屋潮 test 相当の情報で入力 (完了しなくて OK、test mode なので)
   - 作成後の `acct_test_xxx` 部分の ID を控える
5. Developers > Webhooks > Add endpoint (Test mode)
   - Endpoint URL: `https://dev.xorder.co.jp/api/webhooks/stripe`
   - Events: 本番と同じ 3 event (`payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`)
   - 発行された `whsec_test_...` を控える
6. 取得した値を Supabase weir-dev EF Secrets + Vercel staging env に設定:
   - `STRIPE_PUBLIC_KEY=pk_test_...`
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_test_...`

#### タスク 6: LINE STG Channel 新規作成 (15 分)

1. https://developers.line.biz にログイン
2. Providers > `weir` (既存) > Create a new channel
3. Channel Type: **LINE Login**
4. 以下入力:
   - App name: `weir STG`
   - App icon: 既存利用
   - Callback URL: `https://dev.xorder.co.jp/api/members/login/line/callback`
5. 作成後:
   - Channel ID を記録 → `LINE_CHANNEL_ID`
   - Channel secret を記録 → `LINE_CHANNEL_SECRET`
6. Vercel staging + Supabase weir-dev EF に投入

#### タスク 7: Resend STG domain 追加 (15 分)

1. https://resend.com/dashboard > Domains > Add Domain
2. Domain: `dev.weir.co.jp`
3. 表示される DNS TXT / DKIM / SPF レコードを DNS (Cloudflare) に追加
4. Resend の Verify ボタンで status = Verified を確認
5. API Keys > Create API Key
   - Name: `weir-stg`
   - Permissions: `Sending access` (full か domain 制限は任意)
   - 生成された `re_...` を記録 → `RESEND_API_KEY`
6. Vercel staging env + Supabase weir-dev EF に投入

#### タスク 8: GitHub Secrets 9 件設定

§3-9 の表参照。

#### タスク 9: GitHub Environment Protection `production` 設定 (5 分)

1. GitHub Repository > Settings > Environments
2. `New environment` > Name: `production`
3. 以下を設定:
   - **Required reviewers**: `taiseiwolt` を追加 (Tasei 自身、self-approval 可)
   - **Wait timer**: 0 分
   - **Deployment branches and tags**: Selected branches > `main`
4. Save

#### タスク 10: main / staging ブランチ保護ルール設定

§2-B の手順を実施。**feature/cc-env-b の PR を main にマージした後**に実施する。理由: 保護ルール (PR 1 approval 必須) を先に入れると、feature/cc-env-b の PR マージもこのルール対象になり、流れが複雑になる。

---

### 4-B: STG 環境変数一覧

19 件。既存の「本番値を流用」と「STG 用に新規発行」を明示。

| # | 変数名 | 本番値 (抜粋) | STG 値 (方針) | Vercel (staging) | Supabase EF (weir-dev) | 取得方法 |
|---|---|---|---|---|---|---|
| 1 | `SUPABASE_URL` | `https://iikwusprydaogzeslgdz.supabase.co` | `https://<weir-dev-ref>.supabase.co` | ✅ | ✅ | タスク 1 完了後、Dashboard URL |
| 2 | `SUPABASE_ANON_KEY` | 既存 `sb_publishable_oiOC...` | 新規 `sb_publishable_*` | ✅ | ✅ | weir-dev Dashboard > API > Project API keys |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | 既存 `eyJhbGc...` | 新規 `eyJhbGc*` | ✅ | ✅ | 同上 |
| 4 | `SUPABASE_DB_URL` | 既存 conn string | 新規 conn string | — | ✅ | weir-dev Dashboard > Settings > Database |
| 5 | `STRIPE_SECRET_KEY` | `sk_live_51TAiXE...` | `sk_test_*` | ✅ | ✅ | タスク 5 |
| 6 | `STRIPE_PUBLIC_KEY` | `pk_live_51TAiXE...` | `pk_test_*` | ✅ | — | タスク 5 |
| 7 | `STRIPE_WEBHOOK_SECRET` | `whsec_4bH...` | `whsec_test_*` | ✅ | — | タスク 5 webhook 登録後 |
| 8 | `FRONTEND_URL` | `https://xorder.co.jp` | `https://dev.xorder.co.jp` | ✅ | ✅ | 既知 |
| 9 | `LINE_CALLBACK_URL` | `https://xorder.co.jp/api/members/login/line/callback` | `https://dev.xorder.co.jp/api/members/login/line/callback` | ✅ | — | 既知 |
| 10 | `LINE_CHANNEL_ID` | `2009451269` | 新規 (タスク 6) | ✅ | ✅ | タスク 6 |
| 11 | `LINE_CHANNEL_SECRET` | `8eeb009b...` | 新規 (タスク 6) | ✅ | ✅ | タスク 6 |
| 12 | `ANTHROPIC_API_KEY` | 既存 `sk-ant-...` | **共有** (同値) | ✅ | ✅ | 本番値流用 |
| 13 | `OPENAI_API_KEY` | 既存 `sk-proj-...` | **共有** (同値) | ✅ | ✅ | 本番値流用 |
| 14 | `GOOGLE_GEOCODING_API_KEY` | 既存 `AIza...` | **共有** + Referrer 制限に `dev.xorder.co.jp` 追加 | — | ✅ | Google Cloud Console で Referrer 設定のみ |
| 15 | `GOOGLE_MAPS_API_KEY` | 既存 `AIza...` | **共有** + Referrer 追加 | — | ✅ | 同上 |
| 16 | `RESEND_API_KEY` | 本番 key (digest `4f84da91...`) | 新規 (タスク 7) | — | ✅ | タスク 7 |
| 17 | `ALERT_EMAIL_TO` | `taisei@weir.co.jp` 想定 | `taisei+stg@weir.co.jp` (Gmail エイリアス) | — | ✅ | Gmail 機能 (設定不要) |
| 18 | `FCM_SERVICE_ACCOUNT` | 本番 service account JSON | **本番値流用** (D-178 保留) | — | ✅ | 本番値流用 |
| 19 | `FIRECRAWL_API_KEY` | 本番 key | **共有** | ✅ | — | 本番値流用 |

**削除対象** (CC_ENV-A 推奨に従い):
- `AIDEN_SERVICE_ROLE_JWT` (旧 AIden 命名残骸、SUPABASE_SERVICE_ROLE_KEY と役割重複)
  - Vercel / Supabase EF の両方から削除
  - Phase B の本番 env 変更は原則スコープ外だが、これだけは「旧名残」として CC ENV-C で削除する

**注意点**:
- `FRONTEND_URL` と `STRIPE_SECRET_KEY` は CC_ENV-A 発見 3 で本番 EF 側が「想定外の謎の値」になっている。STG 値で上書きしても本番側の謎の値は変わらない。**本番側の謎の値の上書き同期は Phase B スコープ外** (CC ENV-C で取扱)。

---

### 4-C: 検証チェックリスト

Phase B 完了時、Tasei が以下を確認:

#### Supabase (weir-dev)
- [ ] Project 作成完了、URL `https://<weir-dev-ref>.supabase.co` 取得
- [ ] 101 テーブル作成 (`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'` = 101)
- [ ] 5 VIEW 作成 (`SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public'` = 5)
- [ ] マスタ件数一致 (`SELECT COUNT(*) FROM brands`, `merchants`, `venues`, `products` が本番と一致)
- [ ] トランザクション空 (`SELECT COUNT(*) FROM orders`, `members`, `reservations` すべて 0)
- [ ] Stripe ID 空 (`SELECT COUNT(*) FROM merchants WHERE stripe_account_id IS NOT NULL` = 0、venues 同様)
- [ ] `corps` テーブル不在 (migration 履歴除外されているはず、念のため確認)

#### Vercel
- [ ] staging Custom Environment 作成完了
- [ ] dev.xorder.co.jp Custom Domain 設定、SSL 発行済、https でアクセス可
- [ ] staging env 19 件投入済、末尾 `\n` 汚染なし (値を Edit で開いて目視)
- [ ] staging branch への push で Vercel 自動デプロイ、dev.xorder.co.jp でサイト確認

#### GitHub
- [ ] staging branch 作成済 (remote 存在、`git ls-remote origin staging` で確認)
- [ ] main / staging ブランチ保護ルール設定完了
- [ ] Secrets 9 件登録済
- [ ] Environment `production` (required reviewer = taiseiwolt) 設定済
- [ ] Workflow ファイル 5 個 + dependabot.yml + composite action + firecrawl-scan.js 存在 (PR マージ後に `.github/` 配下確認)

#### External
- [ ] Stripe Test Mode connect test account 作成、webhook 登録、Event 3 種配信確認
- [ ] LINE STG Channel の Channel ID / Secret 記録済、Callback URL 登録済
- [ ] Resend dev.weir.co.jp Verified、STG API key 発行済

#### End-to-End
- [ ] staging に `chore: test staging pipeline` でダミー commit + push
  - → Vercel staging deploy 自動発火、dev.xorder.co.jp 更新を確認
  - → GHA-02 staging-playwright 起動を確認 (失敗してよい、baseURL 未対応ケース)
- [ ] migration を含む PR を staging に出す (`supabase/migrations/` に no-op migration 追加など)
  - → GHA-03 staging-migration 起動、weir-dev に反映を確認
- [ ] main に migration を含む PR マージ
  - → GHA-04 production-migration の approval pending 画面が表示されることを確認
  - → 承認 → 本番 Supabase に反映を確認

---

## 5. 検証の義務 (S-04) 報告

| 項目 | 検証方法 | 結果 |
|---|---|---|
| bash スクリプト構文 | `bash -n stg_001_master_data_export.sh` / `stg_003_schema_only_tables.sh` | ✅ 両方 syntax OK |
| SQL 構文 | psql での構文チェックは本番接続なしで不可 | ⚠️ 手動目視のみ。Tasei 実行時に確認 |
| YAML workflow 構文 | Python PyYAML で parse | ✅ 6 ファイル (5 workflow + action + dependabot) 全て parse 成功 |
| JavaScript 構文 | `node --check firecrawl-scan.js` | ✅ syntax OK |
| 実スクリプト実行 | PROD_DB_URL / STG_DB_URL 未設定のため実行不可 | ⚠️ 未検証、Tasei 手動で weir-dev 作成後に実行 |
| GitHub Actions 実行 | workflow はコミット後に初めて起動、事前実行不可 | ⚠️ 未検証、PR merge + staging push 後に実地確認 |
| branch 作成 | `git branch -v` | ✅ staging = feature/cc-env-b と独立、main の HEAD に追従 |
| Firecrawl API | `FIRECRAWL_API_KEY` 未保有のため実走行不可 | ⚠️ 未検証、staging 環境で初回実走で確認 |
| ENV-A 報告整合性 | 44 マスタ + 46 tx + 5 view + 6 境界 + 1 廃止 = 102 | ✅ 件数一致、境界判断 6 件の判断根拠も ENV-A メモと整合 |
| Supabase CLI 実動作 | `supabase link` / `db push` の実動作確認は weir-dev 作成前で不可 | ⚠️ 未検証、タスク 1 完了後に Tasei 実行 |

**検証可能範囲は全て ✅**。実走行の検証は weir-dev project 作成待ち。

---

## 6. 残課題 (本依頼スコープ外、CC ENV-C へ)

| # | 項目 | 理由 | 優先度 |
|---|---|---|---|
| 1 | STG 基本動作確認 (SSL / Auth / DB 接続) | 実環境構築後でないと不可 | 🔴 高 |
| 2 | `playwright.config.cjs` に `use.baseURL` 追加 | 発見 3、GHA-02 の STG 実走行前提 | 🔴 高 |
| 3 | Playwright 116 項目の STG 実行 | e2e 本体、STG 安定後 | 🟡 中 |
| 4 | 本番 `DROP TABLE corps` 実施 | Tasei 承認待ち、Phase C | 🟢 低 |
| 5 | 本番 `AIDEN_SERVICE_ROLE_JWT` 削除 | 旧名残整理 | 🟢 低 |
| 6 | 本番 `STRIPE_SECRET_KEY` / `FRONTEND_URL` 謎の値上書き同期 | CC_ENV-A 発見 3、整合解消 | 🟡 中 |
| 7 | 連絡先メール (brands.contact_email 等) の STG ダミー化 | PII 流出リスク軽減、Tasei 判断待ち | 🟡 中 |
| 8 | CC M Phase β+γ+δ+ε の STG 実装 | ゲスト注文設計、別プロジェクト | 🟢 低 |
| 9 | FCM STG 分離判断 (D-178 保留) | aiden-pos 仕様 fix 後 | 🟢 低 |
| 10 | Vercel deployment watcher の導入 | `sleep 120` の置き換え、安定化 | 🟢 低 |

---

## 7. スコープ外 (実施しなかったこと、明示)

- ❌ **本番 Supabase の変更** (DROP corps, env 変数上書き等) — Tasei 承認待ち、別 PR
- ❌ **weir-dev Supabase プロジェクトの実作成** — Tasei 手動 (タスク 1)
- ❌ **Vercel Custom Environment / Custom Domain の実設定** — Tasei 手動 (タスク 2-3)
- ❌ **Stripe Test Mode / LINE STG / Resend STG の外部サービス設定** — Tasei 手動 (タスク 5-7)
- ❌ **GitHub Secrets / Environment / Branch Protection の実設定** — Tasei 手動 (タスク 8-10)
- ❌ **migration SQL の実走行** — PROD_DB_URL / STG_DB_URL が必要、Tasei 環境で実行
- ❌ **GHA workflow の実走行確認** — commit merge + push staging 後の初回で確認
- ❌ **既存コードの改善 / refactor** — スコープ制限 (S-05 徹底)、ENV-B の範囲外
- ❌ **CC ENV-C スコープの実装** — §6 の残課題は後続依頼

---

## 8. ファイル一覧 (本コミットで追加)

```
supabase/migrations-stg/
  README.md                                    (6.1 KB)
  stg_001_master_data_export.sh                (6.7 KB、exec)
  stg_002_stripe_id_sanitization.sql           (3.6 KB)
  stg_003_schema_only_tables.sh                (4.7 KB、exec)

.github/
  dependabot.yml                               (npm + github-actions 週次)
  actions/notify-email/action.yml              (composite action、Resend email)
  scripts/firecrawl-scan.js                    (6 URL + 7 marker チェック)
  workflows/
    pr-checks.yml                              (GHA-01)
    staging-playwright.yml                     (GHA-02)
    staging-migration.yml                      (GHA-03)
    production-migration.yml                   (GHA-04)
    firecrawl-scan.yml                         (GHA-05)

cc-requests/
  CC_ENV-B_report_20260419.md                  (本書)
```

---

## ⑦ Devil's Advocate レビュー結果

### 使用したエージェント (依頼書の観点)
- [x] Product Manager: CC / Tasei の責務分離、並列可能タスクの明示
- [x] QA Lead: 検証チェックリスト詳細化、S-04 で検証可否を明記
- [x] Business Director: POC 準備 3 週シナリオ整合 (§4-A で所要合計 2-3 時間に圧縮)
- [x] Privacy Officer: Stripe ID サニタイズ SQL、PII 含むマスタコピーの扱いを §6 残課題に明示
- [x] Stripe Integrator: Test Mode 切替 + Connect test account 手順詳細化
- [ ] Legal Director / Corporate: 該当なし

### 出力前チェックゲート
- [x] 時系列で追える? → §4-A でタスク 1〜10 を順序 + 並列可否付きで提示
- [x] いつ・誰が何をする? → Tasei 手動 10 項目、CC 実装は commit 済
- [x] 既存の仕組みとの関係? → CC_ENV-A 連携、D-174/176/178 + PF-7 教訓反映
- [x] 失敗時の検知? → 各 workflow の notify-email、検証チェックリスト
- [x] Tasei が「何すればいいの?」と聞かなくて済む? → §4-A のステップで yes

### 検出された問題と対応
| 問題 | 対応 |
|---|---|
| notify-email の reusable workflow 指定が step-level uses と整合しない | composite action に変更、理由を §発見 2 で明示 |
| playwright.config.cjs に baseURL 未設定 | §発見 3 で明示、§6 残課題 #2 に格上げ |
| Dependabot PR が main 保護ルールでブロック | `target-branch: staging` 設定で回避 |
| ローカル main が origin/main 先行 (10 commits) | §発見 5 で明示、push 前に `git rebase origin/main` |
| 廃止予定 `corps` の本番 DROP は別依頼 | §6 残課題 #4 明示 |
| 連絡先メール PII の STG ダミー化は未実装 | §6 残課題 #7 明示、Tasei 判断待ち |

---

**完了**: 2026-04-19 JST
**ベースブランチ**: feature/cc-env-b (origin/main 937eb82 にリベース後 push 予定)
**次セッション引き継ぎ**: CC ENV-C (STG 基本動作確認 + Playwright 116 項目 + CC M Phase β+γ+δ+ε)
