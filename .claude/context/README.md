# .claude/context/

CC（Claude Code）が常時参照する決定事項・運用ルールのシンボリックリンク集。

## 構造

- `index.md` → `~/Desktop/aiden-decisions-index.md`（決定事項インデックス、symlink）
- `archive.md` → `~/Desktop/aiden-decisions-archive.md`（決定事項アーカイブ、symlink）
- `secrets.md` → `~/Desktop/aiden-decisions-secrets.md`（認証情報、symlink、git 管理外）
- `cc-template-v2.md` → CC 依頼文テンプレ（実体ファイル、git 管理対象）
- `agents-project-execution.md` → CC 運用ルール（実体ファイル、git 管理対象）

## セットアップ（新環境で必要）

```bash
cd /Users/taisei/Desktop/weir/.claude/context
ln -s ~/Desktop/aiden-decisions-index.md index.md
ln -s ~/Desktop/aiden-decisions-archive.md archive.md
ln -s ~/Desktop/aiden-decisions-secrets.md secrets.md
```

## CC 利用ルール

CC は依頼文を受け取ったら、実行前に必ず以下を view すること:
- `.claude/context/index.md`（最新の決定事項・タスク優先度）
- `.claude/context/cc-template-v2.md`（CC 依頼文の標準テンプレ）
- `.claude/context/agents-project-execution.md`（⑦ Devil's Advocate / ⑧ Project Supervisor 等の運用ルール）

関連する決定事項があれば `archive.md` も view すること。

## マスタ管理

`index.md` / `archive.md` / `secrets.md` のマスタは **ローカル** `~/Desktop/` 配下。
- Chat（Claude）が更新を提示
- Tasei が `~/Desktop/` のファイルに反映
- シンボリックリンク経由で `.claude/context/` から自動参照
- PK にも同時アップロード（Tasei 手動）

## 運用注意

- シンボリックリンクは macOS のみ動作。他環境では再セットアップ必要
- `secrets.md` は絶対に `git add` しないこと（.gitignore で防止済）
- リポジトリには「シンボリックリンクのファイル名」のみ存在、内容は git 管理外
