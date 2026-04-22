# Step 3 タイル画像（CC-22a-fix6 で配置）

オンボフロー Step 3 の 16 枚タイル画像をここに配置する。

## 命名規則

`weir-{tone}-{N}.webp`

- `tone`: warmth / modern / premium / casual
- `N`: 1-4

例:
```
weir-warmth-1.webp
weir-warmth-2.webp
weir-warmth-3.webp
weir-warmth-4.webp
weir-modern-1.webp
...
weir-casual-4.webp
```

## 推奨仕様

- 形式: WebP（または JPG / PNG）
- 解像度: 800×600 以上（aspect-ratio は CSS 側で 4×4 グリッドに合わせて自動調整）
- 内容: 日本の飲食店、業態 × トーンが一目で分かる写真。人物の顔がメインの画像は避ける

## 差替手順（CC-22a-fix6）

1. 16 枚をこのディレクトリに配置
2. `weir-onboarding.html` の `MOCK_DATA_SOURCE.getPreviews()` の `tiles` 配列で
   各 entry の Unsplash photo ID を `/assets/onboarding/step3/weir-{tone}-{N}.webp` に差し替え
   （`UNSPLASH(...)` の代わりに固定パスを返すよう調整、または別ヘルパーを追加）
3. CSP は `'self'` を許可しているので追加不要
