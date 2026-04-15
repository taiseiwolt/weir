# aiden-hardcode-check

D-83 ハードコード全件スキャン。本番配信される全HTMLファイルをgrepして違反を検出する。

## 実行手順

以下を実行してください：

```bash
cd /Users/taisei/Desktop/aiden-demo

echo "=== D-83 ハードコードスキャン ==="
echo ""

FILES=(
  "weir-admin.html"
  "weir-customer-admin.html"
  "weir-order.html"
  "weir-order-store.html"
  "weir-brand-stores.html"
  "weir-store.html"
  "brand.html"
  "weir-brand-news.html"
  "weir-brand-menu.html"
)

PATTERN="炭火亭|sumibite|Sumibite|スミビ|山田太郎|また一つ、焼肉|近重泰輔|佐藤花子|鈴木一郎|高橋次郎|テスト店舗|テストブランド"

TOTAL=0
for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    COUNT=$(grep -ciE "$PATTERN" "$FILE" 2>/dev/null || true)
    COUNT=${COUNT:-0}
    if [ "$COUNT" -gt 0 ]; then
      echo "🔴 $FILE: ${COUNT}件"
      grep -nE "$PATTERN" "$FILE" | head -5
    else
      echo "✅ $FILE: 0件"
    fi
    TOTAL=$((TOTAL + COUNT))
  else
    echo "⚠️  $FILE: ファイルが見つかりません"
  fi
done

echo ""
echo "=== 合計: ${TOTAL}件 ==="
if [ "$TOTAL" -eq 0 ]; then
  echo "✅ D-83違反なし"
else
  echo "🔴 D-83違反あり。修正が必要です。"
fi
```

## スキャン後
- 0件であれば問題なし
- 1件以上あれば該当ファイル・行番号を報告してTaiseiに確認を求めること
