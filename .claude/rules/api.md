# API (Serverless Functions) 設計規約

## エンドポイント
- 命名: `/api/{resource}`（RESTful）

## レスポンス
- 形式: `{ success: boolean, data?: any, error?: string }`
- HTTPステータスコード: 200, 400, 401, 404, 500 を適切に使い分ける

## セキュリティ
- service_role key: サーバーサイドのみで使用（フロントに露出させない）
- 認証が必要なAPI: Supabase Auth の JWT を検証する
