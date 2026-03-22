# 外部ヘルスチェック手順書

Coworkの外部監視タスク用。1日3回（8:00, 14:00, 20:00 JST）に実行する。

---

## 1. 本番URL応答確認

### チェック方法
```bash
curl -o /dev/null -s -w "%{http_code} %{time_total}s\n" https://aiden-jp.net
```

### 判定基準
| 結果 | 判定 |
|------|------|
| HTTP 200 & < 5秒 | ✅ 正常 |
| HTTP 200 & > 5秒 | ⚠️ Warning（レスポンス遅延） |
| HTTP 5xx or 接続不可 | 🚨 Critical（サイトダウン） |

### 異常時の対応
1. Vercelダッシュボードでデプロイ状態を確認
2. Supabaseダッシュボードでサービス状態を確認
3. 5分後に再確認して持続的な問題か判断
4. 持続する場合はTaiseiにSlack/メールで連絡

---

## 2. Supabase使用量確認

### ダッシュボードURL
https://supabase.com/dashboard/project/iikwusprydaogzeslgdz

### 確認項目

#### DB容量
- Settings > Database > Disk Usage
- Warning: 350MB超過 / Critical: 450MB超過

#### Storage使用量
- Settings > Storage > Usage
- Warning: 700MB超過 / Critical: 900MB超過

#### DB接続数
- Database > Connections
- Warning: 48接続超過 / Critical: 57接続超過

#### Auth MAU
- Authentication > Users（月間アクティブ数）
- Warning: 40,000超過 / Critical: 48,000超過

### 内部監視（レイヤー1）の補完
上記はEdge Function `monitor-usage` で1時間おきに自動チェック済み。
外部チェックは **Supabase自体がダウンした場合** の検知が主目的。

---

## 3. Vercelデプロイ状態確認

### ダッシュボードURL
https://vercel.com/taiseiwolts-projects/aiden-demo

### 確認項目
- 最新デプロイのステータスが "Ready" であること
- ビルドエラーがないこと
- Functionsタブでサーバーレス関数がエラーを出していないこと

### 異常時の対応
1. ビルドエラー: エラーログを確認し、直近のcommitが原因か特定
2. ランタイムエラー: Functions > Logs でエラー詳細を確認
3. Taiseiに連絡し、ロールバックまたは修正を依頼

---

## 4. monitoring_alertsテーブル確認

### 未解決アラートの確認
Supabase Dashboard > Table Editor > monitoring_alerts で `resolved_at IS NULL` のレコードを確認。

未解決アラートがある場合:
- `severity` = critical → 即対応
- `severity` = warning → 次回チェックまで経過観察
- `recommended_action` カラムに対策が記載されている

---

## 5. エスカレーション手順

### Warning レベル
- 次回チェック時に再確認
- 2回連続でWarningなら Taisei に報告

### Critical レベル
- 即座に Taisei に連絡（Slack > メール）
- `recommended_action` の内容を伝える
- 可能なら初動対応（Vercelロールバック等）を実施

### Supabase自体のダウン
- https://status.supabase.com/ を確認
- Supabase障害の場合は復旧を待つ（自分では対処不可）
- Taisei に障害発生を連絡

### Stripe障害
- https://status.stripe.com/ を確認
- 障害時は決済機能が停止するため、事業者への通知を検討
