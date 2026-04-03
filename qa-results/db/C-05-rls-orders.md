# C-05: orders テーブル RLS テスト
- 日時: 2026-03-23
- 担当: db-verifier
- 結果: PASS

## SELECT テスト
- HTTP Status: 200
- Response Body: `[]`
- 判定: PASS（空配列が返り、データは閲覧不可）

## INSERT テスト
- HTTP Status: 401
- Response Body: `{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"orders\""}`
- 判定: PASS（RLS ポリシーにより拒否）

## 所見
- 提供された JWT 形式の anon key は無効（401 Invalid API key）。プロジェクトで使用中の publishable key（`sb_publishable_...`）でテストを実施。
- SELECT: HTTP 200 だが空配列 `[]` を返却。RLS により anon ユーザーにはデータが見えない状態。
- INSERT: 必須カラム不足時は 400（NOT NULL constraint）、全カラム指定時は 401 + `42501` RLS violation。RLS が正しく機能している。
- INSERT の部分入力（必須カラム不足）で 400 が返る点は、RLS チェックより先に DB 制約チェックが走るため。セキュリティ上の問題はない（どちらにしても挿入は不可）。
