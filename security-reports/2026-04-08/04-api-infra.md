# API・インフラテスター（API & Infrastructure Tester）セキュリティテストレポート

**実行日**: 2026-04-08
**対象リポジトリ**: github.com/taiseiwolt/aiden-demo + github.com/taiseiwolt/aiden-pos
**対象コミット**: dfc961121447fdd0c593b6f269cead14e20df1a2

## サマリ
- チェック項目数: 10 Vercel Functions + 36 Edge Functions + インフラ8カテゴリ
- 問題なし: 30+
- 要改善（P2/P3）: 12
- 脆弱性あり（P0/P1）: 7

---

## Vercel Serverless Functions セキュリティステータス

| Function | 認証 | メソッド制限 | 入力検証 | SQLi対策 | エラー処理 | 判定 |
|---|---|---|---|---|---|---|
| api/health.js | なし（公開） | GET | N/A | N/A | OK | OK |
| api/orders/[...path].js | JWT（createはゲスト可） | アクション別 | OK | パラメタライズド | e.message露出 | P2 |
| api/delivery/[...path].js | なし（スタブ） | アクション別 | 最小限 | N/A | OK | P3 |
| api/members/[...path].js | アクション別 | アクション別 | OK | パラメタライズド | e.message露出 | P2 |
| api/menu/[...path].js | なし（公開） | GET | store_id必須 | パラメタライズド | e.message露出 | OK |
| api/payments/webhook.js | Stripe署名 | POST | 署名検証 | パラメタライズド | OK | OK |
| api/restaurants/[...path].js | なし（公開） | GET | OK | パラメタライズド | e.message露出 | OK |
| api/admin/[...path].js | JWT+admin | 全メソッド | エンティティ設定 | パラメタライズド | e.message露出 | P1 |
| api/bulk-import/[...path].js | JWT+admin | アクション別 | 行数制限500 | パラメタライズド | e.message露出 | P2 |
| api/chat/[...path].js | 混合 | アクション別 | メッセージ必須 | パラメタライズド | console.error残存 | P1 |

## Supabase Edge Functions セキュリティステータス（主要）

| Function | 認証 | CORS | 判定 |
|---|---|---|---|
| confirm-order | なし（Stripe PI検証） | 共有CORS | OK |
| stripe-create-payment-intent | なし（公開チェックアウト） | 共有CORS | OK |
| stripe-create-refund | JWT/service_role | 共有CORS | OK |
| stripe-connect-create | JWT/service_role | 共有CORS | OK |
| stripe-connect-onboarding | JWT/service_role | 共有CORS | OK |
| line-auth-callback | なし（OAuthコールバック） | 共有CORS | P1 |
| send-order-email | JWT/service_role | 共有CORS | OK |
| generate-review-reply | JWT/service_role | 共有CORS | OK |
| generate-sns-post | JWT/service_role | 共有CORS | OK |
| generate-pop-image | JWT/service_role | 共有CORS | OK |
| compensation-point-grant | JWT/service_role | 共有CORS | OK |
| check-ban | なし（公開） | 共有CORS | P3 |
| create-reservation | なし（公開） | 共有CORS | P2 |
| **run-migration** | **なし** | **なし** | **P0** |

---

## 発見事項

### P0/P1（即時対応）

#### P0-1: run-migration Edge Functionに認証なし
- **対象**: `supabase/functions/run-migration/index.ts`
- **内容**: データベースに`SUPABASE_DB_URL`で直接接続し、生SQLを実行する関数に認証ゼロ。さらにUSING(true)の過度に寛容なRLSポリシーを作成。
- **再現手順**: Edge FunctionのURLにPOSTリクエスト送信
- **影響**: 非認証の任意SQLポリシー作成、データ露出
- **修正方針**: この関数を削除するか、service_role認証を必須にする。作成された過度に寛容なRLSポリシーも見直す。
- **フェーズ影響**: Phase 1

#### P1-1: LINE Authコールバックが一時認証情報をURLフラグメントに渡す
- **対象**: `supabase/functions/line-auth-callback/index.ts` lines 139-206
- **内容**: temp_emailとtemp_passwordがURLフラグメントに含まれる。ブラウザ履歴、拡張機能、Referrerヘッダー経由で漏洩リスク。
- **修正方針**: 短寿命の使い捨てトークンを使用するか、admin APIで直接セッション発行
- **フェーズ影響**: Phase 1

#### P1-2: LINE Authコールバックが全ユーザーをイテレーション
- **対象**: `supabase/functions/line-auth-callback/index.ts` line 113
- **内容**: `sbAdmin.auth.admin.listUsers()`で全ユーザーをメモリにロード。ユーザー増加でDoSリスク。
- **修正方針**: line_user_idをインデックス付きカラムに保存し直接クエリ
- **フェーズ影響**: Phase 1

#### P1-3: Admin APIにハードコードされたメールフォールバック
- **対象**: `api/admin/[...path].js` line 60
- **内容**: `if (user.email === 'taiseiwolt@gmail.com') return true;` — ハードコードされた管理者バイパス。メールアカウント侵害で全管理者権限を取得。
- **修正方針**: ハードコードを削除し、staff_accountsのロールベースチェックのみに依存
- **フェーズ影響**: Phase 1

#### P1-4: チャットエンドポイント（sessions/analytics/resolve/policies）に認証なし
- **対象**: `api/chat/[...path].js`
- **内容**: handleSessions, handleAnalytics, handleResolve, handlePoliciesに認証チェックなし。非認証ユーザーが全チャットセッション閲覧、分析データ取得、セッション解決、ストアポリシー操作が可能。
- **修正方針**: requireAuth + admin/staffロールチェックを追加
- **フェーズ影響**: Phase 1

#### P1-5: チャットfeedback/historyエンドポイントに認証なし
- **対象**: `api/chat/[...path].js`
- **内容**: handleFeedbackで任意のmessage_idのフィードバック更新、handleHistoryで任意のsession_idのチャット履歴読み取りが認証なしで可能
- **フェーズ影響**: Phase 1

#### P1-6: LINE stateパラメータがコールバックで未検証
- **対象**: `supabase/functions/line-auth-callback/index.ts` lines 52-55
- **内容**: nonceがサーバーサイドで発行されたものか検証されない。redirect_afterが許可リストに照合されない。攻撃者がstate偽造でユーザーを悪意あるURLにリダイレクト可能。
- **修正方針**: nonceをサーバーサイドまたは署名付きCookieで保存・検証。redirect_afterを許可パスのリストと照合。
- **フェーズ影響**: Phase 1

---

### P2/P3（計画的対応）

#### P2-1: エラーメッセージが内部情報を露出
- **対象**: 複数Vercel APIファイル
- **内容**: e.messageがDBスキーマ、カラム名、制約情報を含む可能性
- **修正方針**: クライアントには汎用エラーメッセージ、詳細はサーバーサイドログのみ
- **フェーズ影響**: Phase 1

#### P2-2: 注文作成エンドポイントが非認証でmember_id受け入れ
- **対象**: `api/orders/[...path].js` lines 67-92
- **内容**: member_idの所有者確認なしで任意のメンバーに注文を紐付け可能
- **フェーズ影響**: Phase 1

#### P2-3: インメモリレート制限（チャットAPI）
- **対象**: `api/chat/[...path].js` lines 8-26
- **内容**: Vercelサーバーレスはステートレスで、コールドスタート毎にリセット。実質レート制限なし。
- **修正方針**: 外部ストア（Redis、Vercel KV等）を使用
- **フェーズ影響**: Phase 2

#### P2-4: CORSオリジンマッチングがstartsWithを使用
- **対象**: `api/_lib/response.js` line 15
- **内容**: `ALLOWED_ORIGINS.some(o => origin.startsWith(o))` — `https://aiden-jp.net.evil.com`がマッチする
- **修正方針**: `ALLOWED_ORIGINS.includes(origin)`に変更
- **フェーズ影響**: Phase 1

#### P2-5: create-reservationにレート制限なし
- **対象**: `supabase/functions/create-reservation/index.ts`
- **内容**: 公開エンドポイントで予約スパムが可能
- **フェーズ影響**: Phase 2

#### P2-6: console.errorが本番コードに残存
- **対象**: api/orders, api/chat, api/payments
- **フェーズ影響**: Phase 1

#### P2-7: taiseiwolt.github.ioがCORS許可オリジンに含まれる
- **対象**: `api/_lib/response.js` line 3
- **内容**: GitHub Pagesオリジンがフォークで信頼される
- **フェーズ影響**: Phase 1

#### P3-1: Delivery APIがスタブのまま認証なしでデプロイ
- **対象**: `api/delivery/[...path].js`
- **フェーズ影響**: Phase 2

#### P3-2: check-banがエラー時にfail-open
- **対象**: `supabase/functions/check-ban/index.ts`
- **内容**: エラー時に`{banned: false}`を返す（設計上の判断だが、バイパス可能）
- **フェーズ影響**: Phase 1

#### P3-3: log-payment-failureが広範な認証を受け入れ
- **対象**: `supabase/functions/log-payment-failure/index.ts`
- **内容**: anon key含む任意のapikey headerでpayment_attemptsに書き込み可能
- **フェーズ影響**: Phase 1

#### P3-4: localhostオリジンがVercel CORS本番コードに含まれる
- **対象**: `api/_lib/response.js` lines 4-7
- **修正方針**: 環境変数で条件分岐
- **フェーズ影響**: Phase 1

---

## CORS設定サマリ

**Vercel Functions**: ワイルドカード`*`不使用、許可リスト方式。ただしstartsWithマッチング（P2-4）とlocalhost含む（P3-4）。

**Edge Functions**: ワイルドカード不使用、許可リスト方式。`Vary: Origin`ヘッダー含む（正確）。

**CSP**: `default-src 'self'`、CDNドメイン限定。ただし`'unsafe-inline'`含む。

## 環境変数管理
- .gitignoreに`.env*`含む — 確認済み
- コミット済みコードにハードコードされた秘密情報なし
- service_role key — サーバーサイドのみ
- STRIPE_SECRET_KEY — サーバーサイドのみ
- AI APIキー — Edge Functionsのみ

---

### 問題なし
- Stripe Webhook署名検証: 適切に実装
- パラメタライズドクエリ: 全Vercel FunctionsでSupabase client使用
- Edge Functions環境変数: Deno.env.get()経由
- メール送信: escapeHtml()適用、APIキーは環境変数
- AI APIキー: サーバーサイド限定
- STDプラン制限: checkAiQuota()で強制
- Vercel SSL: 自動管理
