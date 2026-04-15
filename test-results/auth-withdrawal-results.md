# メール認証 + 退会フロー テスト結果

実行日: 2026-03-22
実行者: Claude Code
デプロイ先: https://xorder.co.jp

---

## タスクA: メール認証フロー（Phase 1）

### A-1: Supabase Auth設定変更
- **PASS** - `mailer_autoconfirm: false`（Confirm email ON）確認済み
- **PASS** - `mailer_otp_exp: 3600`（60分）確認済み
- **PASS** - `site_url` を `https://xorder.co.jp` に更新
- **PASS** - `uri_allow_list` にリダイレクトURL追加

### A-2: 認証メールテンプレート
- **PASS** - 件名: 「【Weir】メールアドレスの認証をお願いします」に変更
- **PASS** - 本文: Weirブランドデザインの日本語テンプレートに変更
- **PASS** - 認証ボタン付きHTMLメール

### A-3: 登録完了画面（認証待ち画面）
- **PASS** - `weir-email-pending.html` 作成
- 認証メール送信メッセージ表示
- 60分以内の認証を促す案内
- 迷惑メールフォルダ確認の案内
- 認証メール再送ボタン（最大3回制限）

### A-4: ログイン処理修正
- **PASS** - 未認証ユーザーのログイン → `EMAIL_NOT_VERIFIED` エラー返却
- **PASS** - 退会済みユーザーのログイン → `ACCOUNT_WITHDRAWN` エラー返却
- **PASS** - 認証済みユーザーのログイン → 正常にトークン返却

### A-5: 認証完了ページ
- **PASS** - `weir-email-verified.html` 作成
- 認証成功: 「会員登録が完了しました」+ ログインボタン
- 認証失敗: エラーメッセージ + 再登録誘導

### A-6: メール認証フロー検証

| # | テスト内容 | 結果 | 備考 |
|---|-----------|------|------|
| A-6-1 | 新規会員登録 → 認証メール送信 | **PASS** | member_id返却・メッセージ確認 |
| A-6-2 | 未認証状態でログイン → 拒否 | **PASS** | `EMAIL_NOT_VERIFIED` コード返却 |
| A-6-3 | 認証完了後にログイン → 成功 | **PASS** | access_token・member情報返却 |
| A-6-4 | 認証メール再送 → 成功 | **PASS** | 再送APIレスポンス確認 |

---

## タスクB: 退会フロー（Phase 1 = 即時退会のみ）

### B-1: DB変更
- **PASS** - `withdrawal_status` (TEXT) カラム追加
- **PASS** - `withdrawal_requested_at` (TIMESTAMPTZ) カラム追加
- **PASS** - `withdrawal_completed_at` (TIMESTAMPTZ) カラム追加
- **PASS** - CHECK制約追加（NULL, 'pending', 'withdrawn'）
- **PASS** - インデックス追加

### B-2: MyPage退会ボタン
- **PASS** - ページ最下部に控えめな「退会する」ボタン追加
- グレーテキスト・下線スタイル

### B-3: 退会確認画面（モーダル）
- **PASS** - ポイント残高表示
- **PASS** - 90日間データ保持の説明
- **PASS** - 7年間注文履歴保持の説明
- **PASS** - 「退会する」(赤)・「キャンセル」ボタン
- **PASS** - ESCキー・背景クリックで閉じる

### B-4: 退会処理実装
- **PASS** - 進行中注文チェック → ブロック
- **PASS** - ポイント全額失効（point_transactionsにexpiredレコード）
- **PASS** - 未使用クーポン無効化
- **PASS** - withdrawal_status = 'withdrawn' 更新
- **PASS** - withdrawal_completed_at 更新
- **PASS** - セッション無効化（signOut）

### B-5: 退会完了画面
- **PASS** - 「退会が完了しました」表示
- **PASS** - トップページへのリンク
- **PASS** - ログアウト済み状態

### B-6: 退会済みユーザーのログインブロック
- **PASS** - `ACCOUNT_WITHDRAWN` エラーコード返却

### B-7: 退会フロー検証

| # | テスト内容 | 結果 | 備考 |
|---|-----------|------|------|
| B-7-1 | 退会実行 → 正常完了 | **PASS** | 「退会が完了しました」メッセージ |
| B-7-2 | 退会後にログイン → 拒否 | **PASS** | `ACCOUNT_WITHDRAWN` コード |
| B-7-3 | DB状態確認 | **PASS** | withdrawal_status='withdrawn', timestamps設定済み |
| B-7-4 | 進行中注文ありで退会 → ブロック | **PASS** | `ACTIVE_ORDERS_EXIST` コード |

---

## 変更ファイル一覧

### 新規作成
| ファイル | 内容 |
|---------|------|
| `weir-email-verified.html` | メール認証完了ページ |
| `weir-email-pending.html` | 認証待ち画面（再送ボタン付き） |
| `supabase/migrations/20260322000000_withdrawal_columns.sql` | 退会カラム追加マイグレーション |

### 修正
| ファイル | 修正内容 |
|---------|---------|
| `api/members/[...path].js` | ログインにemail_confirmed_at・withdrawal_statusチェック追加、register APIにbrand_id・name対応追加、resend-verification API追加、withdraw API追加、パスセグメント解析バグ修正 |
| `api/_lib/response.js` | error関数にエラーコード引数追加 |
| `weir-mypage.html` | 退会ボタン・確認モーダル・完了画面・JS処理追加 |

### Supabase設定変更
| 設定 | 変更内容 |
|------|---------|
| `site_url` | `http://localhost:3000` → `https://xorder.co.jp` |
| `uri_allow_list` | リダイレクトURL追加 |
| `mailer_subjects_confirmation` | 日本語件名に変更 |
| `mailer_templates_confirmation_content` | Weirブランドの日本語テンプレートに変更 |

### DB変更
| テーブル | 変更 |
|---------|------|
| `members` | `withdrawal_status`, `withdrawal_requested_at`, `withdrawal_completed_at` カラム追加 |

---

## テストデータ
- テスト用アカウント2件作成 → 検証後に全て削除済み
- テスト用注文1件作成 → 検証後に削除済み

## 追加発見・修正したバグ
- **Vercel API パスセグメント解析バグ**: `[...path].js` のcatch-allパラメータが `req.query.path` ではなく `req.query['...path']` に格納される問題を修正。全APIハンドラで修正。
- **members.name NOT NULL制約**: register APIで `name` カラム（NOT NULL）への値設定が漏れていた問題を修正。
- **members.brand_id NOT NULL制約**: register APIで `brand_id` を必須パラメータとして追加。
