# JavaScript コーディング規約

## Supabase
- Supabase JS Client v2 を使用（CDN経由）
- API Key はコードにハードコードしない（環境変数経由）

## セキュリティ
- ユーザー入力値は必ずサニタイズする（XSS対策）
- innerHTML にDB/APIから取得した文字列を代入する際は必ず escH() でエスケープする
  - OK: `el.innerHTML = escH(data.name)`
  - NG: `el.innerHTML = data.name`

## デバッグ
- console.log: デバッグ完了後に必ず削除する
