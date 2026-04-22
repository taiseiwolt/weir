# Step 3 業態画像

Weir オンボーディング Step 3（16 業態プレビュー）で使用する画像セット。

## 配置先

**リポジトリ直下の `/assets/onboarding/step3/`**
（`public/` は `outputDirectory: "."` 設定下でルート配信されないため。CLAUDE.md の Vercel gotcha 参照）

本番 URL:
```
https://weir.vercel.app/assets/onboarding/step3/weir-{tone}-{n}.webp
https://xorder.co.jp/assets/onboarding/step3/weir-{tone}-{n}.webp
```

## 命名規則

`weir-{tone}-{n}.webp`

- tone: `warmth` | `modern` | `premium` | `casual`
- n: `1` | `2` | `3` | `4`

## 16 業態一覧（CC-22a-fix6 確定 / D-215）

### 温かみ（warmth）

| ファイル | 業態 |
|---|---|
| weir-warmth-1.webp | 居酒屋 |
| weir-warmth-2.webp | うどん・そば |
| weir-warmth-3.webp | 町中華 |
| weir-warmth-4.webp | ラーメン |

### モダン（modern）

| ファイル | 業態 |
|---|---|
| weir-modern-1.webp | モダンベーカリー |
| weir-modern-2.webp | 親しみやすいイタリアン |
| weir-modern-3.webp | デザインカフェ |
| weir-modern-4.webp | グルメバーガー |

### 高級（premium）

| ファイル | 業態 |
|---|---|
| weir-premium-1.webp | フレンチ |
| weir-premium-2.webp | 町の寿司屋 |
| weir-premium-3.webp | パティスリー |
| weir-premium-4.webp | 懐石・割烹 |

### カジュアル（casual）

| ファイル | 業態 |
|---|---|
| weir-casual-1.webp | スパイスカレー |
| weir-casual-2.webp | 焼き鳥 |
| weir-casual-3.webp | 定食・丼もの |
| weir-casual-4.webp | エスニック |

## 画像仕様

- 形式: webp
- アスペクト比: 4:3
- 推奨サイズ: 100-300KB / 枚
- 全 16 枚合計: 2-3MB 以内

## 画像再生成ガイドライン

- 加盟店画像を含まない（装飾 / 雰囲気のみ）
- Taisei 承認なく内容変更しない
- 新規業態追加時は別 Decision 発行
