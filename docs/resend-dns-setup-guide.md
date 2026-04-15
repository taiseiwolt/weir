# Resend ドメイン検証 — お名前.com DNS設定手順書

**作成日:** 2026-03-26
**対象ドメイン:** weir.co.jp
**目的:** Resend からのメール送信を有効にする（注文確認メール等）

---

## 現状の問題

| 問題 | 詳細 |
|------|------|
| Resend ステータス | `failed`（SPF と MX が検出できず 72 時間経過） |
| 原因 | Resend が求める SPF / MX レコードがルートドメインに誤設定されている |
| 正しい設定先 | サブドメイン `send.weir.co.jp` |
| Google Workspace | ルートの MX（smtp.google.com）は残す必要あり |

---

## 作業概要

1. ルートドメインから **Resend 用の MX と SPF** を削除
2. ルートドメインに **Google Workspace 用の SPF** を再設定
3. サブドメイン `send` に **Resend 用の MX と SPF** を追加
4. Resend ダッシュボードで再検証
5. DMARC を追加（推奨）

---

## Step 1: お名前.com にログイン → DNS設定画面を開く

1. https://navi.onamae.com/ にログイン
2. 上部メニュー「ネームサーバーの設定」→「ドメインのDNS設定」をクリック
3. `weir.co.jp` を選択
4. 「DNSレコード設定を利用する」の「設定する」ボタンをクリック

---

## Step 2: ルートドメインから Resend 用レコードを削除（2件）

DNS レコード一覧から、以下の **2 件を削除** してください。
レコード横の「削除」ボタン（ゴミ箱アイコン or ×）をクリックします。

### 削除① — ルートの MX（Resend 用）

| 項目 | 現在の値（これを探す） |
|------|------------------------|
| ホスト名 | （空欄 or @） |
| TYPE | **MX** |
| VALUE | **feedback-smtp.ap-northeast-1.amazonses.com** |
| 優先度 | **10** |

> ⚠️ **MX レコードは2件あります。削除するのは優先度 10 だけです。**
>
> | 優先度 | VALUE | 操作 |
> |--------|-------|------|
> | **10** | feedback-smtp.ap-northeast-1.amazonses.com | ❌ **これを削除** |
> | **1** | smtp.google.com | ✅ **これは残す（Gmail用）** |

### 削除② — ルートの TXT（Resend SPF）

| 項目 | 現在の値（これを探す） |
|------|------------------------|
| ホスト名 | （空欄 or @） |
| TYPE | **TXT** |
| VALUE | **v=spf1 include:amazonses.com ~all** |

> ⚠️ **TXT レコードは3件あります。削除するのは上記の1件だけです。**
>
> | VALUE | 操作 |
> |-------|------|
> | v=spf1 include:amazonses.com ~all | ❌ **これを削除** |
> | google-site-verification=AwKpkirq6IAlVigpLpKoGnMJP7KSh_z1AzKMmDjNoI0 | ✅ **残す** |
> | v=DMARC1; p=none; | ✅ **残す** |

---

## Step 3: ルートドメインに Google Workspace 用 SPF を追加

削除②で Resend 用 SPF を消すと、ルートに SPF レコードがなくなります。
Google Workspace（Gmail 送信）のために以下を **新規追加** してください。

「追加」ボタンをクリックして、以下の値を **1文字も変えずにコピペ** してください。

### 追加① — ルートの TXT（Google SPF）

| 項目 | 入力値（コピペ用） |
|------|---------------------|
| ホスト名 | （空欄のまま） |
| TYPE | **TXT** |
| VALUE | **v=spf1 include:_spf.google.com ~all** |
| TTL | **3600** |
| 優先度 | （TXTなので入力不要） |

```
コピペ用 VALUE:
v=spf1 include:_spf.google.com ~all
```

---

## Step 4: サブドメイン `send` に Resend 用レコードを追加（2件）

「追加」ボタンをクリックして、以下の値を **1文字も変えずにコピペ** してください。
ホスト名は `send` と入力します（`send.weir.co.jp` ではなく `send` だけ）。

### 追加② — send の MX（Resend バウンス受信用）

| 項目 | 入力値（コピペ用） |
|------|---------------------|
| ホスト名 | **send** |
| TYPE | **MX** |
| VALUE | **feedback-smtp.ap-northeast-1.amazonses.com** |
| 優先度 | **10** |
| TTL | **3600** |

```
コピペ用 ホスト名:
send

コピペ用 VALUE:
feedback-smtp.ap-northeast-1.amazonses.com
```

### 追加③ — send の TXT（Resend SPF 認証用）

| 項目 | 入力値（コピペ用） |
|------|---------------------|
| ホスト名 | **send** |
| TYPE | **TXT** |
| VALUE | **v=spf1 include:amazonses.com ~all** |
| TTL | **3600** |
| 優先度 | （TXTなので入力不要） |

```
コピペ用 ホスト名:
send

コピペ用 VALUE:
v=spf1 include:amazonses.com ~all
```

---

## Step 5: DMARC レコードを修正（推奨）

現在ルートに設定されている DMARC（`v=DMARC1; p=none;`）を、
レポート付きの設定に更新します。

### 既存のDMARCレコードを確認

| 項目 | 値 |
|------|-----|
| ホスト名 | `_dmarc` |
| TYPE | TXT |
| VALUE | `v=DMARC1; p=none;` |

→ このレコードがあればそのままでOK。なければ以下を追加：

### 追加④ — DMARC（既存がない場合のみ）

| 項目 | 入力値 |
|------|--------|
| ホスト名 | `_dmarc` |
| TYPE | TXT |
| VALUE | `v=DMARC1; p=none; rua=mailto:taisei.maeda@weir.co.jp` |
| TTL | 3600 |

> `rua=mailto:...` を付けると、なりすまし検出レポートが届くようになります（任意）。

---

## Step 6: 設定を保存

1. すべての追加・削除を確認
2. 画面下部の「確認画面へ進む」をクリック
3. 内容を最終確認して「設定する」をクリック

---

## Step 7: Resend ダッシュボードで再検証

1. https://resend.com/domains にアクセス
2. `weir.co.jp` をクリック
3. 「Verify DNS Records」ボタンをクリック
4. ステータスが `pending` → `verified` になるのを待つ（通常 5 分〜数時間）

> DNS の反映には最大 24 時間かかることがありますが、
> お名前.com では通常 10〜30 分で反映されます。

---

## 最終確認：DNS レコード一覧（設定完了後の正しい状態）

### ルートドメイン（weir.co.jp）

| TYPE | ホスト名 | VALUE | 備考 |
|------|----------|-------|------|
| MX | @ | `smtp.google.com`（優先度 1） | Google Workspace 用 ✅ |
| TXT | @ | `v=spf1 include:_spf.google.com ~all` | Google SPF ✅ |
| TXT | @ | `google-site-verification=AwKpkirq6IAlVigpLpKoGnMJP7KSh_z1AzKMmDjNoI0` | Search Console ✅ |

### サブドメイン

| TYPE | ホスト名 | VALUE | 備考 |
|------|----------|-------|------|
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com`（優先度 10） | Resend バウンス受信 ✅ |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Resend SPF ✅ |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDQ+r3UfeAgFXnm3I+FsxC6Ygdj6kV1tvS30axFmdfvWb4VNhlm5zf26dS8G7Feq18+9Knn1r1bZgPum/KBzIz60g2pwOvzpyidaJaLeaGk14i8xa9aZcyenF5pjmhF5VKSDWAdh/ffnRTDDLICwn8zx5hvUkGVndvZkP3l+7zZGwIDAQAB`（既存 verified、変更不要） | Resend DKIM ✅ |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC ✅ |

### 削除されているべきレコード（ルートから消す）

| TYPE | ホスト名 | VALUE | 状態 |
|------|----------|-------|------|
| MX | @ | `feedback-smtp.ap-northeast-1.amazonses.com`（優先度 10） | ❌ 削除 |
| TXT | @ | `v=spf1 include:amazonses.com ~all` | ❌ 削除 |

---

## Google Workspace への影響

| 確認項目 | 結果 |
|----------|------|
| Gmail 受信（MX） | 影響なし（`smtp.google.com` は残す） |
| Gmail 送信（SPF） | 影響なし（`_spf.google.com` に変更するため正しく認証される） |
| Google Search Console | 影響なし（verification TXT は残す） |

---

## トラブルシューティング

### DNS 変更後に Resend が verified にならない場合
```bash
# ターミナルで確認コマンド（Mac）
dig send.weir.co.jp MX +short
# → 期待値: 10 feedback-smtp.ap-northeast-1.amazonses.com.

dig send.weir.co.jp TXT +short
# → 期待値: "v=spf1 include:amazonses.com ~all"
```

### Gmail が届かなくなった場合
```bash
dig weir.co.jp MX +short
# → 期待値: 1 smtp.google.com.
# ↑ これが消えていたら、ルートの MX を誤って削除している
```

---

## 設定完了後の確認依頼

DNS 設定が完了したら、Claude Code に以下を伝えてください：
「Resend の DNS 設定完了した。検証確認して、テストメール送信して」

→ Resend API でステータス確認 + テスト注文2件へのメール再送を実行します。
