# AIden 決定事項インデックス

> 詳細は `.claude/decisions/` フォルダ内の各ファイルを参照
> **このファイルがProject Knowledgeにアップロードされる唯一のdecisionsファイル**
> 最終更新: 2026-04-01

---

## タスク優先度
→ 詳細: decisions/tasks.md

### P0: POCブロッカー（8件中7件完了）
- P0-1 [project] ✅ Stripe決済停止の解消 完了(2026-03-30)
- P0-2 [project] ✅ 特商法電話番号確認 完了(2026-03-28)
- P0-3 [project] ✅ 来店予約マイグレーションSQL実行 完了(2026-03-27)
- P0-4 [project] ✅ 来店予約EF 5本デプロイ 完了(2026-03-27)
- P0-5 [project] ✅ トラッキング画面根本修正 完了(2026-03-28)
- P0-6 [project] ✅ 日次自動ジョブPATH修正 完了(2026-03-28)
- P0-7 [project] 🔄 店舗候補への声かけ — Taisei単独対応中（中目黒エリア）
- P0-8 [project] ✅ テスト注文2件の返金 完了(2026-03-27)

### P1: POC開始前推奨（8件中6件完了）
- P1-1 [project] ✅ 予約注文トラッキング（パターンB）完了(2026-03-29)
- P1-2 [project] ✅ E2Eテスト116項目全PASS 完了(2026-03-30)
- P1-2a [project] ✅ モバイルUIUXテスト 完了(2026-03-30) 274/300 PASS
- P1-3 [project] ⏳ 法務ドキュメント施行日記入 — POC開始日に合わせて（P0-7依存）
- P1-4 [project] ✅ オンボーディング台本設計 完了(2026-03-27)
- P1-5 [project] ✅ AI品質Phase 1詳細設計 完了(2026-03-27)
- P1-6 [project] 店舗決定後 — 事業者契約書v2締結（P0-7依存）
- P1-7 [project] 🔄 Flutter受注アプリ（AIden POS）開発中(2026-03-31着手)

### P2〜P4: 詳細は decisions/tasks.md

---

## ビジネス方針（B-01〜B-07）
→ 詳細: decisions/business.md
- B-01 [user] 本質的価値=AI経営支援。決済はデータ収集基盤
- B-02 [user] 低価格SaaSで広く撒く→データ蓄積→コンサルで稼ぐ
- B-03 [user] 決済基盤: POCはStripe継続。Square連携はPOC後判断
- B-04 [user] エリア集中戦略: 中目黒から開始
- B-05 [user] サービス料: 全店舗デフォルトoff(0%)、店舗ごとにon/off可能
- B-06 [user] 来店予約: POCスコープに含む
- B-07 [user] Dine-in: POC後に持ち越し

---

## 料金体系（P-01〜P-04）
→ 詳細: decisions/business.md
- P-01 [reference] STD ¥0 / PRO ¥4,980 / EXPERT ¥9,800（月額/店舗）
- P-02 [reference] 手数料率: Dine-in 3.8% / Takeout・Delivery 4.0%
- P-03 [reference] Stripe手数料3.6%はAIden負担（実質マージン: dine-in 0.2%, takeout/delivery 0.4%）
- P-04 [reference] AI無料枠: レビュー返信10件/月, SNS投稿10件/月, POP画像1件/月

---

## 開発・運用ルール（D-01〜D-19）
→ 詳細: decisions/dev-rules.md
- D-01 [feedback] CC依頼: 本番URL確認必須。スキップ時は「未確認」と明記
- D-02 [feedback] CC依頼・方針決定時のエージェント横断レビュー必須
- D-03 [feedback] CC依頼文はワンクリックコピー可能な形式で渡す
- D-04 [feedback] 改善はレポート→承認制。エージェント定義の自動書き換え禁止
- D-05 [reference] エージェント管理: .claude/agents/ がマスター(Single Source of Truth)
- D-06 [feedback] 決定事項追加の都度、ClaudeがこのMDを更新する
- D-07 [user] 日報: 毎日19:00にClaude側からpush型でリマインド
- D-08 [user] 日報リマインダー時間: 19:00（20:00から変更）
- D-09 [feedback] タスク優先度はdecisions.mdで管理（引き継ぎ漏れ防止）
- D-10 [reference] Phase 0自動化: crontab+Claude CLI統一（Cowork全9タスク削除済み）
- D-11 [feedback] SQL生成時はinformation_schema.columnsで実テーブルカラムを確認してから出力
- D-12 [reference] Phase 0: 「異常or提案がある時だけメール通知」方式。5分間隔で同時実行回避
- D-13 [reference] チームB: 7エージェント構成。承認ポイント3箇所
- D-14 [feedback] 全アウトプットに⑦Output Review Templateを必須セクションとして含める
- D-15 [user] デリバリーはPOCスコープ外。テストは「選択不可確認」1項目のみ
- D-16 [feedback] テストはコードレビュー+実ブラウザテストの2段階
- D-17 [reference] crontabスケジュール: 6:00台（旧9:00台から変更）。リトライ機構あり
- D-18 [project] Flutter受注アプリ: 5画面+テスト36項目。POC前に完全動作必須
- D-19 [feedback] CC完了報告フォーマット: status/summary/changes/verification/manual_actions

---

## 来店予約仕様（R-01〜R-09）
→ 詳細: decisions/reservations.md
- R-01 [user] WEBからの予約（ブランドHP/個店ページ）。UI実装済み（モック状態）
- R-02 [user] 予約確定方法: 店舗が自由選択（即時確定 or 承認制）
- R-03 [user] キャンセル: 3日前まで自動可、3日以内は店舗承認制
- R-04 [user] キャンセル料: 店舗設定（クレカ必須 or 不要）
- R-05 [user] ゲスト予約: 可能
- R-06 [user] 店舗通知: メール + 受注ダッシュボード
- R-07 [user] ダッシュボード: カレンダービュー + リストビュー（切替可能）
- R-08 [user] 予約ゲストPII（名前・電話）: 事業者表示OK（予約管理に必要）
- R-09 [project] ✅ バックエンド全完了(2026-03-27)

---

## 予約注文トラッキング（T-01〜T-02）
→ 詳細: decisions/reservations.md
- T-01 [user] パターンB: 60分以上先→静的表示、60分以内→カウントダウン
- T-02 [user] setIntervalで1分ごとに再計算し自動切替

---

## AI品質設計（AQ-01〜AQ-06）
→ 詳細: decisions/reservations.md
- AQ-01 [user] 統合プロフィールシート: 3階層61項目で情報収集を1回で完結
- AQ-02 [user] 収集データを7箇所（AIプロンプト/HP/MO/顧客管理/予約/法務等）に一括反映
- AQ-03 [user] 運用フロー: ①対面回収→②確認+補足→③CCがDB投入→④動作確認
- AQ-04 [user] トーン: フォーマル/カジュアル/フレンドリーの3択
- AQ-05 [user] 入力形式: プルダウン最大限活用、自由入力は最小限
- AQ-06 [project] Phase 1=設計確定。Phase 2=手動週次(Month 1)。Phase 3=自動(Month 2-3)

---

## 法務・インフラ（L-01〜L-09）
→ 詳細: decisions/legal.md
- L-01 [reference] 事業者名: 個人事業主 前田 大生（屋号: AIden）
- L-02 [reference] 所在地: 渋谷道玄坂東急ビル2F-C（GMOバーチャルオフィス）
- L-03 [reference] メール: support@aiden-jp.net（Google Workspaceエイリアス）
- L-04 [reference] 電話: 個人携帯（後日03plusに差替予定）
- L-05 [project] ✅ Resendドメイン検証完了（sendサブドメイン）
- L-06 [reference] 準拠法: 日本法、管轄: 東京地方裁判所
- L-07 [user] 契約書v2チャージバック条項強化（出前館規約参考）
- L-08 [user] 弁護士チェック: 高リスク2点はPOC後にまとめて確認
- L-09 [reference] PP・利用規約の公開URL作成完了

---

## Go/No-Go判定基準
→ 詳細: decisions/go-nogo.md
- G-01〜G-08: Go条件8項目（G-01 ✅, G-02 🔄P0-7依存, G-03 ✅, G-04 ✅, G-05 ✅, G-06 🔄P1-3依存, G-07 ✅, G-08 ✅）
- NG-01〜NG-05: No-Go条件5項目
- F-01〜F-04: POC失敗判定基準4項目（撤退基準）

---

## CS導線設計（CS-01〜CS-03）
→ 詳細: decisions/dev-rules.md
- CS-01 [user] 事業者向け: 右下固定チャットアイコン、AI自動応答
- CS-02 [user] エンドユーザー向け: MO画面フッター+マイページ、AI自動応答
- CS-03 [reference] AIの知識源: FAQ + 操作マニュアル + 契約情報

---

## Square商談結果（SQ-01〜SQ-02）
→ 詳細: decisions/business.md
- SQ-01 [reference] Squareプラットフォーム型決済非対応、店頭2%台/オンライン3.24%
- SQ-02 [user] Square連携はPOCで店舗の声を聞いてから判断

---

## Taiseiからの指示事項（I-01〜I-06）
→ 詳細: decisions/instructions.md
- I-01 [user] Coworkアウトプットは自動改善使用。Claudeが通知しないとTaiseiは承認タイミング不明
- I-02 [user] 優先度の再定義はTaiseiと議論して決める（Claude単独で決めない）
- I-03 [user] 過去チャットの決定事項は確実に引き継ぐ。引き継ぎ漏れは許容しない
- I-04 [feedback] テスト116項目は全修正完了後に実行（途中で送らない）
- I-05 [feedback] 予約注文トラッキングはトラッキング根本修正完了後に送る
- I-06 [user] 全回答にエージェント横断レビューを含めること
