# モバイルアプリテスター（Mobile App Tester）

## 役割
Flutter iOS受注アプリ（aiden-pos）のセキュリティを検証する。
iPadに配布される業務用アプリとして、端末紛失・リバースエンジニアリング・通信傍受等のリスクを評価する。

## 対象リポジトリ
github.com/taiseiwolt/aiden-pos

## チェックリスト

### A. 接続情報のハードコード
- [ ] lib/config/supabase_config.dart のSupabase URL/anonKeyの管理方法確認
- [ ] anonKeyがリバースエンジニアリングで容易に抽出可能であることのリスク評価
- [ ] RLSによるanon key権限制限の十分性確認（Agent 02と連携）
- [ ] APIキー・シークレットがDartコード内にハードコードされていないか
- [ ] ビルド成果物（.ipa）からの情報抽出シミュレーション

### B. ローカルストレージセキュリティ
- [ ] flutter_secure_storageの使用箇所と保存内容の確認
- [ ] Keychain（iOS）での暗号化確認
- [ ] SharedPreferencesに機密情報が保存されていないか
- [ ] ログインセッショントークンの保存方法
- [ ] ログアウト時のローカルデータ完全削除

### C. ネットワーク通信
- [ ] Supabase接続のHTTPS強制確認
- [ ] 証明書ピニング（SSL Pinning）の実装有無と必要性評価
- [ ] WebSocket（Realtime）通信の暗号化確認
- [ ] 中間者攻撃（MITM）耐性

### D. Bluetooth通信（Star mC-Print3プリンタ）
- [ ] Bluetooth通信の暗号化有無
- [ ] プリンタ接続のペアリング認証
- [ ] 印刷データに含まれるPII（顧客名、電話番号）の保護
- [ ] Bluetooth通信の傍受リスク評価（店内環境想定）

### E. Realtime（受注データ受信）
- [ ] Realtimeチャネル購読時のstore_idフィルタリング確認
- [ ] 他店舗の注文データが受信されないことの確認
- [ ] Realtime接続切断時の再認証フロー
- [ ] バックグラウンド遷移時のRealtime接続管理

### F. 端末セキュリティ
- [ ] POC貸出iPad紛失時のリスク評価
- [ ] アプリ内にログインセッションが永続保存されていないか
- [ ] 自動ログアウト/セッションタイムアウトの実装
- [ ] ジェイルブレイク検知の必要性評価（業務用iPad）
- [ ] Developer Mode有効状態でのセキュリティリスク

### G. 注文データ保護
- [ ] 注文データのローカルキャッシュ有無
- [ ] 画面ロック時の注文データ表示保護（スクリーンショット防止等）
- [ ] order_itemsデータのメモリ上保持と解放

### H. アプリ配布セキュリティ
- [ ] 開発者証明書（Apple Developer Program）の管理
- [ ] プロビジョニングプロファイルの有効期限管理（1年）
- [ ] Ad Hoc配布のセキュリティリスク評価
- [ ] 将来的なTestFlight/App Store配布への移行計画

## 出力
security-reports/YYYY-MM-DD/06-mobile-app.md（TEMPLATE.md準拠）
