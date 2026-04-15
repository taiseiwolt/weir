# Weir 横断セキュリティレビュー 最終レポート

**実行日**: 2026-04-08
**実行チーム**: チームC（セキュリティテストチーム）
**対象リポジトリ**: github.com/taiseiwolt/aiden-demo + github.com/taiseiwolt/aiden-pos
**対象コミット**: dfc961121447fdd0c593b6f269cead14e20df1a2

---

## エグゼクティブサマリ

6領域（公開面・認証/RLS・決済・API/インフラ・監視/保守・モバイルアプリ）にわたる横断セキュリティレビューの結果:

| 深刻度 | 件数 | 説明 |
|--------|------|------|
| **P0（即時対応）** | **14件** | データ漏洩、決済不正、認証バイパス。悪用で直接的金銭被害・個人情報流出 |
| **P1（1週間以内）** | **26件** | アクセス制御不備、セッション管理問題。条件次第で悪用可能 |
| **P2（1ヶ月以内）** | **20件** | 情報漏洩リスクあるが攻撃難易度が高い |
| **P3（次回スプリント）** | **10件** | ベストプラクティスからの逸脱 |
| **合計** | **70件** | |

### 最重要発見事項 TOP 5

1. **service_role JWTがGitリポジトリにコミット済み**（02-P0-1）— 全RLSバイパス可能。即座にキーローテーション必須。
2. **RLSポリシーの広範な不備**（02-P0-2〜6）— 11テーブルでanon/authenticated全ロールがフルアクセス可能
3. **レガシー決済フローで金額改ざん・送金先ハイジャック可能**（03-P0-1〜3）— stripe_account_id、金額がクライアントから受け入れられる
4. **run-migration Edge Functionが認証なしでDB操作可能**（04-P0-1）— 生SQLポリシー作成が誰でも可能
5. **管理画面にロールベースアクセス制御なし**（01-P0-2）— 認証済みエンドユーザーが管理画面にアクセス可能

---

## P0 一覧（即時対応 — 14件）

### 認証・RLS（6件）
| ID | 内容 | 影響 |
|----|------|------|
| 02-P0-1 | service_role JWTがマイグレーションファイルにハードコード | **全データ無制限アクセス** |
| 02-P0-2 | 競合分析4テーブル: FOR ALL USING(true)ロール制限なし | データ漏洩・改ざん・削除 |
| 02-P0-3 | orders: 全認証ユーザーが全注文閲覧可能 | PII・ビジネスデータ漏洩 |
| 02-P0-4 | store_policies: anon完全CRUD | 店舗ポリシー改ざん |
| 02-P0-5 | FAQs: anon INSERT/UPDATE/DELETE | FAQデータ改ざん |
| 02-P0-6 | Google Reviews 5テーブル: FOR ALL USING(true)ロール制限なし | レビューデータ操作 |

### 決済（3件）
| ID | 内容 | 影響 |
|----|------|------|
| 03-P0-1 | レガシーフロー: stripe_account_idをクライアントから受信 | **売上不正転送** |
| 03-P0-2 | handleConfirm: 認証なし + クライアントデータを信頼 | **無制限ポイント付与** |
| 03-P0-3 | レガシー金額直接フロー: サーバーサイド価格検証なし | **金額改ざん** |

### 公開面（3件）
| ID | 内容 | 影響 |
|----|------|------|
| 01-P0-1 | Stored XSS: body_htmlの生DOM挿入 | セッションハイジャック |
| 01-P0-2 | weir-admin.html: ロールチェックなし | 管理画面不正アクセス |
| 01-P0-3 | 管理画面: anon keyで機密操作 | 認証バイパス |

### API・インフラ（1件）
| ID | 内容 | 影響 |
|----|------|------|
| 04-P0-1 | run-migration: 認証なしDB操作 | 任意RLSポリシー作成 |

### 監視・保守（1件）
| ID | 内容 | 影響 |
|----|------|------|
| 05-P0-1 | audit_logs: DELETE/UPDATE制限なし | 監査証跡消去可能 |

---

## P0/P1の具体的修正方針

### 1. service_role keyローテーション（02-P0-1）— 最優先

```bash
# Supabase Dashboardで新しいservice_role keyを生成
# 1. https://supabase.com/dashboard → Project Settings → API
# 2. service_role keyをリセット
# 3. Vercel環境変数を更新
# 4. Supabase Edge Function secretsを更新
```

マイグレーションファイルからハードコードを削除:
```sql
-- pg_cron HTTP呼び出しにはVault secretを使用
SELECT vault.create_secret('service_role_key', '<new_key>');

-- pg_cronジョブでVault参照
SELECT
  net.http_post(
    url := '...',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  );
```

### 2. RLSポリシー修正（02-P0-2〜6）

```sql
-- 競合分析テーブル: TO service_role追加
DROP POLICY IF EXISTS "allow_all" ON competitor_collection_config;
CREATE POLICY "service_role_only" ON competitor_collection_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- competitor_stores, competitor_reviews, competitor_metrics_weekly も同様

-- Google Reviewsテーブル: 同様にTO service_role追加
DROP POLICY IF EXISTS "service_role_all" ON google_places;
CREATE POLICY "service_role_only" ON google_places
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- google_reviews, competitor_mappings, collection_progress, review_alerts も同様

-- orders: tenant-scopedポリシーに置換
DROP POLICY IF EXISTS "orders_authenticated_select_all" ON orders;
CREATE POLICY "orders_store_staff_select" ON orders
  FOR SELECT TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM staff_store_assignments
      WHERE account_id = auth.uid()
    )
    OR
    id IN (SELECT id FROM orders WHERE member_id = (
      SELECT id FROM members WHERE account_id = auth.uid()
    ))
  );

-- store_policies: anon書き込み削除
DROP POLICY IF EXISTS "anon_all" ON store_policies;
CREATE POLICY "staff_manage" ON store_policies
  FOR ALL TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM staff_store_assignments WHERE account_id = auth.uid()
    )
  );

-- FAQs: anon書き込み削除
DROP POLICY IF EXISTS "faqs_anon_insert" ON faqs;
DROP POLICY IF EXISTS "faqs_anon_update" ON faqs;
DROP POLICY IF EXISTS "faqs_anon_delete" ON faqs;
```

### 3. レガシー決済フロー修正（03-P0-1〜3）

```javascript
// api/orders/[...path].js — handleCreate修正

// P0-1: stripe_account_idをDBから取得
// BEFORE: const { stripe_account_id } = body;
// AFTER:
const { data: storeData } = await supabase
  .from('stores')
  .select('corporations!inner(stripe_account_id)')
  .eq('id', store_id)
  .single();
const stripe_account_id = storeData?.corporations?.stripe_account_id;

// P0-3: レガシー金額直接パスを無効化
// stripe-create-payment-intent/index.ts のレガシーパス(lines 495-552)を削除
```

```javascript
// P0-2: handleConfirmに認証追加 + DB参照
async function handleConfirm(req, res) {
  const user = await authenticateRequest(req); // 認証追加
  // point_settings をDBから取得
  const { data: ps } = await supabase
    .from('point_settings')
    .select('*')
    .eq('store_id', order.store_id)
    .single();
  // member_rank_multi もDBから取得
}
```

### 4. run-migration Edge Function削除（04-P0-1）

```bash
# 関数を削除
rm -rf supabase/functions/run-migration/
# デプロイ済みの関数も無効化
supabase functions delete run-migration
```

### 5. 管理画面アクセス制御（01-P0-2）

```javascript
// weir-admin.html — セッション確認後にロールチェック追加
const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '/'; return; }

// スタッフアカウント確認
const { data: staff } = await supabase
  .from('staff_accounts')
  .select('role')
  .eq('account_id', session.user.id)
  .in('role', ['platform_admin', 'corp_admin'])
  .single();

if (!staff) {
  alert('管理者権限がありません');
  window.location.href = '/';
  return;
}
```

### 6. SECURITY DEFINER関数のREVOKE（02-P1-3）

```sql
REVOKE EXECUTE ON FUNCTION deduct_points FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_points TO service_role;

REVOKE EXECUTE ON FUNCTION grant_compensation_points FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_compensation_points TO service_role;

REVOKE EXECUTE ON FUNCTION check_and_upgrade_rank FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_and_upgrade_rank TO service_role;

REVOKE EXECUTE ON FUNCTION check_ai_usage_limit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_ai_usage_limit TO service_role;

-- 他のSECURITY DEFINER関数も同様
```

### 7. セキュリティヘッダー追加（05-P1-1 / 01-P1-3）

```json
// vercel.json — headersセクションに追加
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

### 8. audit_logs改ざん防止（05-P0-1）

```sql
-- 追記専用トリガー
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only. UPDATE and DELETE are prohibited.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();
```

### 9. CORS修正（04-P2-4）

```javascript
// api/_lib/response.js
// BEFORE: ALLOWED_ORIGINS.some(o => origin.startsWith(o))
// AFTER:
ALLOWED_ORIGINS.includes(origin)
```

---

## フェーズ別対策マトリクス

### Phase 1（現在: HP+テイクアウト）— 即時対応

| 優先度 | 対策 | 工数目安 | 対象P0/P1 |
|--------|------|---------|-----------|
| 最優先 | service_role keyローテーション | 1h | 02-P0-1 |
| 最優先 | run-migration EF削除 | 0.5h | 04-P0-1 |
| 緊急 | RLSポリシー修正（11テーブル） | 4h | 02-P0-2〜6 |
| 緊急 | レガシー決済フロー修正 | 3h | 03-P0-1〜3 |
| 緊急 | 管理画面ロールチェック追加 | 2h | 01-P0-2, 01-P0-3 |
| 緊急 | SECURITY DEFINER関数REVOKE | 1h | 02-P1-3 |
| 緊急 | チャットAPI認証追加 | 2h | 04-P1-4, P1-5 |
| 高 | XSS修正（body_html + innerHTML） | 2h | 01-P0-1, 01-P1-1 |
| 高 | セキュリティヘッダー追加 | 0.5h | 05-P1-1 |
| 高 | audit_logs改ざん防止 + 返金記録 | 2h | 05-P0-1, 05-P0-2 |
| 高 | handleConfirm認証+DB参照 | 2h | 03-P0-2, 03-P1-5 |
| 高 | CORS修正（startsWith → includes） | 0.5h | 04-P2-4 |
| 高 | ハードコード管理者メール削除 | 0.5h | 04-P1-3 |

### Phase 2（デリバリー追加）

| 優先度 | 対策 | 対象 |
|--------|------|------|
| 高 | LINE Auth修正（一時認証情報、state検証） | 04-P1-1, P1-6 |
| 高 | ゲストPII保持期間定義 | 05-P1-6 |
| 中 | レート制限の外部ストア化 | 04-P2-3 |
| 中 | create-reservationレート制限 | 04-P2-5 |
| 中 | SSLピニング（モバイルアプリ） | 06-P0-2 |
| 中 | エラー監視サービス導入（Sentry） | 05-P1-2 |

### Phase 3（店内注文/タブレット一元化）

| 優先度 | 対策 | 対象 |
|--------|------|------|
| 高 | CSP nonce-based移行 | 01-P1-5, 05-P2-4 |
| 中 | モバイルアプリ完全監査 | 06全項目 |
| 中 | DR文書化・復元テスト | 05-P1-5 |
| 低 | audit_logローテーション | 05-P3-2 |

### Phase 4（勤怠管理・在庫管理）

| 優先度 | 対策 | 対象 |
|--------|------|------|
| 高 | 従業員PII保護・RLS | 新テーブル |
| 高 | 財務データアクセス制御 | 新テーブル |
| 中 | WAF導入検討 | インフラ |

---

## トランザクション規模別リスク評価

### POC期（1-3店舗、中目黒エリア: 30-100注文/日、2,000-5,000 API calls/日）

| リスク | 影響度 | 発生確率 | 対応優先度 |
|--------|--------|---------|-----------|
| service_role key漏洩による全データアクセス | 致命的 | 高（Git公開） | **即時** |
| RLSバイパスによるテナント間データ漏洩 | 高 | 中（技術的知識必要） | **即時** |
| レガシー決済フロー悪用 | 致命的 | 低（レガシーパスの存在を知る必要） | **1週間以内** |
| XSS攻撃 | 中 | 低（管理者権限でbody_html操作が必要） | 1ヶ月以内 |
| ブルートフォース攻撃 | 低 | 低（少量トラフィック） | Phase 2 |

**POC期の最低限**: service_role keyローテーション + P0 RLSポリシー修正 + run-migration削除

### SMB拡大期（10-50店舗、東京都内: 300-2,500注文/日、2万-10万 API calls/日）

| リスク | 影響度 | 発生確率 | 対応優先度 |
|--------|--------|---------|-----------|
| マルチテナント分離の不備 | 致命的 | 高（店舗数増加で露出拡大） | Phase 1で解決必須 |
| 決済不正（金額改ざん、送金先ハイジャック） | 致命的 | 中 | Phase 1で解決必須 |
| DDoS/レート制限なし | 高 | 中（トラフィック増加で標的に） | レート制限実装 |
| 管理画面不正アクセス | 高 | 中（ユーザー数増加） | Phase 1で解決必須 |
| LINE Authフロー悪用 | 中 | 中 | Phase 2 |
| エラー監視不在による障害対応遅延 | 高 | 高 | Sentry導入 |

**SMB拡大期の追加要件**: 全P0/P1修正完了 + レート制限 + エラー監視 + DRドキュメント

### 成長期（100+店舗、首都圏: 5,000+注文/日、50万+ API calls/日）

| リスク | 影響度 | 発生確率 | 対応優先度 |
|--------|--------|---------|-----------|
| audit_log改ざんによるコンプライアンス違反 | 致命的 | 中 | 成長前に解決 |
| ゲストPII無期限保持によるAPPI違反 | 高 | 高（規制強化トレンド） | データ保持ポリシー策定 |
| WAF不在による大規模攻撃 | 高 | 中 | WAF導入 |
| SSLピニングなし（POSアプリ） | 中 | 低 | 検討 |
| バックアップ未検証によるデータ消失 | 致命的 | 低 | DR文書化・テスト |

**成長期の追加要件**: WAF + PITR有効化 + 定期ペネトレーションテスト + SOC2準備

---

## 東京エリア特有の考慮事項

1. **Supabaseリージョン**: プロジェクトがap-northeast-1（東京）にあるか要確認。東京リージョンでない場合、注文ピーク時（ランチ11:30-13:00、ディナー18:00-20:00 JST）にレイテンシが問題化。
2. **飲食店WiFi環境**: 公共WiFiでのMITM攻撃リスクが高い。POSアプリのSSLピニングが重要。
3. **日本APPI準拠**: ゲストPII保持期間の定義が法的に必要。2022年改正個人情報保護法に基づく保有個人データの開示請求対応も検討。
4. **pg_cronタイムゾーン**: UTC設定で正しく運用されていることを確認（JST深夜3時 = UTC 18:00前日）。

---

## 監視成熟度

**現在: Level 1.5** → **Phase 1完了後目標: Level 2.5**

| Level | 要件 | 現状 |
|-------|------|------|
| 1 | 基本ログ記録 | 部分的 |
| 2 | ログ + エラー通知 | 未達（Sentry未導入） |
| 3 | Level 2 + バックアップ + 定期監査 | 未達 |
| 4 | Level 3 + 自動監視 + インシデント対応 | 未達 |
| 5 | Level 4 + ペネトレーションテスト + SOC2 | 未達 |

---

## 個別レポート参照

- [01-public-surface.md](01-public-surface.md) — 公開面テスト（P0: 3件, P1: 5件）
- [02-auth-rls.md](02-auth-rls.md) — 認証・RLSテスト（P0: 6件, P1: 6件）
- [03-payment.md](03-payment.md) — 決済テスト（P0: 3件, P1: 5件）
- [04-api-infra.md](04-api-infra.md) — API・インフラテスト（P0: 1件, P1: 6件）
- [05-monitoring.md](05-monitoring.md) — 監視・保守テスト（P0: 2件, P1: 6件）
- [06-mobile-app.md](06-mobile-app.md) — モバイルアプリテスト（P0: 3件, P1: 2件）※ドキュメントベース評価
