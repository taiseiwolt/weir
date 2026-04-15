# Weir メール認証 + 退会フロー実装依頼

実行日: 2026-03-22
前提: Day 1〜5テスト全完了。セキュリティ修正済み。
仕様書: プロジェクトファイル参照
  - メール認証: aiden-email-verification-spec.md
  - 退会フロー: aiden-withdrawal-spec.md

---

## 接続情報

- GitHub: https://github.com/taiseiwolt/aiden-demo
- ローカルリポジトリ: ~/Desktop/aiden-demo
- 作業ディレクトリ（HTML）: ~/Desktop/aiden.html/
- 本番URL: https://weir.co.jp
- Supabase URL: https://iikwusprydaogzeslgdz.supabase.co
- Supabase Anon Key: sb_publishable_oiOC8uI-wOTexg-02toAOQ_3MXBt8lC
- Access Token: sbp_0bc989fd83759e2909944e4a7117b341834c19b8（期限: 2026-04-15）

---

## 実装スコープ

仕様書にはPhase 1〜3が定義されているが、今回はPOC必須の **Phase 1のみ** を実装する。

---

## タスクA: メール認証フロー（Phase 1）

仕様書: aiden-email-verification-spec.md のセクション2, 7, 8を参照。

### A-1: Supabase Auth設定変更
1. Supabase DashboardまたはCLIで「Confirm email」をONにする
2. Mailer OTP Expirationを3600秒（60分）に設定
3. Redirect URLを認証完了ページのURLに設定

### A-2: 認証メールテンプレート
1. Supabase Authのメールテンプレートをカスタマイズ
2. 件名: 「【Weir】メールアドレスの認証をお願いします」
3. 本文: 仕様書セクション6の内容に準拠
4. 日本語で作成

### A-3: 登録完了画面（認証待ち画面）
1. 会員登録後に表示する画面を作成
2. 表示内容:
   - 「認証メールを送信しました」
   - 「60分以内にメール内のURLをクリックして登録を完了してください」
   - 「メールが届かない場合は迷惑フォルダをご確認ください」
   - 「認証メールを再送する」ボタン（Supabase Auth resend API使用）

### A-4: ログイン処理修正
1. ログイン時に email_confirmed_at を確認
2. NULLの場合 → ログイン拒否 + エラーメッセージ表示:
   - 「メール認証が完了していません」
   - 「認証メールを再送する」ボタン

### A-5: 認証完了ページ
1. メール内URLクリック後のランディングページを作成
2. 表示内容:
   - 「会員登録が完了しました」
   - 「ログイン」ボタン（ログイン画面へ遷移）

### A-6: 検証
1. テストユーザーで新規会員登録 → 認証メールが届くか確認（Supabase Auth Logs確認）
2. 未認証状態でログイン試行 → 拒否されるか確認
3. 認証URL クリック → 認証完了ページ表示 → ログイン可能か確認
4. 認証メール再送ボタン → 再送されるか確認

---

## タスクB: 退会フロー（Phase 1 = 即時退会のみ）

仕様書: aiden-withdrawal-spec.md のセクション2（通常パターン）, 3, 4を参照。
**Phase 1では進行中注文なしの即時退会パターンのみ実装。退会予約パターンはPhase 2（後日）。**

### B-1: DB変更
membersテーブルに以下のカラムを追加:
```sql
ALTER TABLE members ADD COLUMN withdrawal_status TEXT DEFAULT NULL;
ALTER TABLE members ADD COLUMN withdrawal_requested_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE members ADD COLUMN withdrawal_completed_at TIMESTAMPTZ DEFAULT NULL;
```

### B-2: MyPage退会ボタン
1. MyPage画面（aiden-order-mypage.html等）に「退会する」ボタンを追加
2. ボタン配置: ページ最下部（目立たない位置）
3. ボタンスタイル: 赤系、控えめなデザイン

### B-3: 退会確認画面
1. 「退会する」ボタン押下後に確認画面を表示（モーダルまたは別ページ）
2. 表示内容:
   - 「ポイント残高（○○pt）は即時失効します」（point_transactionsから残高取得）
   - 「退会後90日間はデータを保持し、その後匿名化されます」
   - 「注文履歴は法令上7年間保持されます（個人情報との紐付けは解除されます）」
3. 「退会する」ボタン（赤色、2回目の確認）
4. 「キャンセル」ボタン

### B-4: 退会処理実装
「退会する」確定ボタン押下時の処理:
1. 進行中の注文があるか確認（status NOT IN ('completed', 'cancelled')）
   - ある場合: 「進行中の注文があるため退会できません」エラー表示（Phase 1）
   - ない場合: 以下の退会処理を実行
2. ポイント全額失効: point_transactionsにexpiredレコード追加
3. 未使用クーポン無効化
4. 配達先住所削除（ordersテーブルの住所はDELETE）
5. members.withdrawal_status = 'withdrawn' に更新
6. members.withdrawal_completed_at = NOW() に更新
7. セッション無効化（Supabase Auth signOut）
8. 退会完了画面を表示

### B-5: 退会完了画面
1. 表示内容:
   - 「退会が完了しました」
   - トップページへのリンク
2. この画面表示時点でユーザーはログアウト済み

### B-6: 退会済みユーザーのログインブロック
1. ログイン時に members.withdrawal_status を確認
2. 'withdrawn' の場合 → ログイン拒否 + 「このアカウントは退会済みです」表示

### B-7: 検証
1. テストユーザーで退会フロー実行 → 正常に退会できるか
2. 退会後にログイン試行 → 拒否されるか
3. 退会後のDB確認:
   - members.withdrawal_status = 'withdrawn'
   - ポイントが失効しているか
   - 配達先住所が削除されているか
4. 進行中注文ありの状態で退会試行 → ブロックされるか

---

## 実行ルール

1. タスクA → タスクBの順で実装
2. 各タスク完了後に検証を実施
3. 全結果を `~/Desktop/aiden-demo/test-results/auth-withdrawal-results.md` に記録
4. 変更ファイル一覧と修正内容も記録
5. FAILがあれば修正→再テストまで完了
6. テスト用に作成したアカウントやデータは検証後に削除
