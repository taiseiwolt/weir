// Edge Functions 共通認証・セキュリティユーティリティ
// JWT検証、CORS、HTMLエスケープを統一管理する

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- CORS ---
const ALLOWED_ORIGINS = [
  'https://xorder.co.jp',
  'https://www.xorder.co.jp',
  'https://weir.vercel.app',
]

// 開発環境ではlocalhostも許可
if (Deno.env.get('ENVIRONMENT') !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000')
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function corsPreflightResponse(req: Request): Response {
  return new Response('ok', { headers: getCorsHeaders(req) })
}

// --- JWT 検証 ---
export interface AuthResult {
  user: { id: string; email?: string; role?: string } | null
  error: string | null
}

/**
 * Authorization header の Bearer トークンを検証し、ユーザー情報を返す。
 * 無効な場合は error にメッセージが入る。
 */
export async function verifyJwt(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { user: null, error: 'Authorization ヘッダーがありません' }
  }

  const token = authHeader.replace('Bearer ', '')
  if (!token || token === authHeader) {
    return { user: null, error: '無効な Authorization 形式です（Bearer <token> が必要）' }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { user: null, error: '無効または期限切れのトークンです' }
  }

  return {
    user: { id: user.id, email: user.email, role: user.role },
    error: null,
  }
}

/**
 * service_role_key による内部呼び出し検証。
 * pg_cron や他の Edge Function からの呼び出しで使用。
 * 新形式(sb_secret_*)と旧JWT形式の両方に対応。
 */
export function verifyServiceRole(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  // 直接比較（同じ形式の場合）
  if (token === serviceRoleKey) return true

  // 旧JWT形式 → 新sb_secret形式の移行期対応:
  // service_role JWTの場合、Supabase Auth APIで検証して role=service_role を確認
  if (token.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.role === 'service_role' && payload.ref === Deno.env.get('SUPABASE_URL')?.match(/\/\/([^.]+)/)?.[1]) {
        return true
      }
    } catch {
      // JWT parse failed
    }
  }

  return false
}

/**
 * JWT検証を実行し、失敗時は401レスポンスを返す。
 * 成功時は null を返す（処理を続行可能）。
 */
export async function requireAuth(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const { user, error } = await verifyJwt(req)
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: error || '認証が必要です' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  return null
}

/**
 * JWT または service_role_key のいずれかで認証。
 * 管理系エンドポイント + 内部呼び出し両対応。
 */
export async function requireAuthOrServiceRole(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  // まず service_role_key をチェック（内部呼び出し）
  if (verifyServiceRole(req)) {
    return null
  }

  // 次に JWT をチェック（ユーザー認証）
  return requireAuth(req, corsHeaders)
}

// --- HTML エスケープ ---
export function escapeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// --- エラーレスポンスのサニタイズ ---
/**
 * エラーメッセージからDB内部情報を除去してレスポンスに安全な形にする。
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // DB内部のカラム名やテーブル名を含むエラーは汎用メッセージに置換
    const msg = err.message
    if (msg.includes('violates') || msg.includes('constraint') || msg.includes('duplicate key')) {
      return 'データの整合性エラーが発生しました'
    }
    if (msg.includes('relation') || msg.includes('column')) {
      return '内部エラーが発生しました'
    }
    return msg
  }
  return '予期しないエラーが発生しました'
}
