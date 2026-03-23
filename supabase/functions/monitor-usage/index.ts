// Supabase Edge Function: monitor-usage
// POST /functions/v1/monitor-usage
//
// 1時間おきにpg_cronから呼び出され、各種サービスの使用量を監視する。
// 閾値超過時のみアラートメールを送信し、復旧時に復旧通知を送信する。
// 正常時はサイレント（何も送信しない）。
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY
//   ALERT_EMAIL_TO  （アラート送信先メールアドレス）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const ALERT_EMAIL_TO = Deno.env.get('ALERT_EMAIL_TO') || ''

const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

const FROM_EMAIL = 'noreply@aiden-jp.net'
const FROM_NAME = 'AIden監視'

// Access Token の期限（固定値）
const ACCESS_TOKEN_EXPIRY = new Date('2026-06-20T00:00:00Z')

// 本番URL
const PRODUCTION_URL = 'https://aiden-jp.net'

// 主要Edge Functions一覧（デプロイ状態チェック用）
const CRITICAL_EDGE_FUNCTIONS = [
  'confirm-order',
  'stripe-create-payment-intent',
  'send-order-email',
  'line-auth-callback',
  'monitor-usage',
]

// Supabase Free tier limits
const DB_SIZE_LIMIT_MB = 500     // Free: 500MB
const STORAGE_LIMIT_MB = 1000    // Free: 1GB
const MAX_CONNECTIONS = 60       // Free tier approx
const EDGE_FUNCTIONS_MONTHLY_LIMIT = 2_000_000 // Free: 2M invocations
const AUTH_MAU_LIMIT = 50_000    // Free: 50,000

// --- 監視項目定義 ---
interface CheckResult {
  checkType: string
  label: string
  currentValue: string
  warningThreshold: string
  criticalThreshold: string
  severity: 'ok' | 'warning' | 'critical'
  recommendedAction: string
  message: string
}

interface MonitoringAlert {
  id: string
  check_type: string
  severity: string
  resolved_at: string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- メトリクス取得関数群 ---

async function checkDbSize(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: "SELECT pg_database_size(current_database()) as size_bytes"
  }).maybeSingle()

  // Fallback: rpc が使えない場合は直接クエリ
  let sizeBytes = 0
  if (error || !data) {
    const { data: d2 } = await supabase
      .from('monitoring_alerts')
      .select('id')
      .limit(0)
    // DB size cannot be retrieved without raw SQL access from Edge Function
    // Use Supabase Management API instead
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/get_db_size`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
          },
          body: '{}',
        }
      )
      if (res.ok) {
        const result = await res.json()
        sizeBytes = typeof result === 'number' ? result : (result?.size_bytes || 0)
      }
    } catch {
      // If RPC doesn't exist, we'll create it via migration
      // For now, estimate from table counts
      sizeBytes = 0
    }
  } else {
    sizeBytes = data.size_bytes || 0
  }

  const sizeMB = sizeBytes / (1024 * 1024)
  const warningMB = DB_SIZE_LIMIT_MB * 0.7  // 350MB
  const criticalMB = DB_SIZE_LIMIT_MB * 0.9 // 450MB

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (sizeMB >= criticalMB) {
    severity = 'critical'
    action = '即座に不要データを削除。Proプラン未加入なら緊急アップグレードを検討'
  } else if (sizeMB >= warningMB) {
    severity = 'warning'
    action = '不要データの棚卸し・古いログの削除を検討'
  }

  return {
    checkType: 'db_size',
    label: 'Supabase DB容量',
    currentValue: `${sizeMB.toFixed(1)}MB / ${DB_SIZE_LIMIT_MB}MB (${((sizeMB / DB_SIZE_LIMIT_MB) * 100).toFixed(1)}%)`,
    warningThreshold: `${warningMB}MB (70%)`,
    criticalThreshold: `${criticalMB}MB (90%)`,
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `DB容量が${severity === 'critical' ? 'Critical' : 'Warning'}閾値を超えています` : '',
  }
}

async function checkStorageUsage(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  // storage.objects の合計サイズを集計
  let totalBytes = 0
  try {
    const { data, error } = await supabase
      .from('objects')
      .select('metadata')
      .limit(1000)
    // storage.objects is in the storage schema, not accessible via standard client
    // Use management API or estimate
  } catch {
    // ignore
  }

  // Alternative: use RPC function
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_storage_size`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
        body: '{}',
      }
    )
    if (res.ok) {
      const result = await res.json()
      totalBytes = typeof result === 'number' ? result : (result?.total_bytes || 0)
    }
  } catch {
    totalBytes = 0
  }

  const sizeMB = totalBytes / (1024 * 1024)
  const warningMB = STORAGE_LIMIT_MB * 0.7  // 700MB
  const criticalMB = STORAGE_LIMIT_MB * 0.9 // 900MB

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (sizeMB >= criticalMB) {
    severity = 'critical'
    action = '即座に不要ファイルを削除'
  } else if (sizeMB >= warningMB) {
    severity = 'warning'
    action = '未使用画像の棚卸し'
  }

  return {
    checkType: 'storage_size',
    label: 'Supabase Storage使用量',
    currentValue: `${sizeMB.toFixed(1)}MB / ${STORAGE_LIMIT_MB}MB (${((sizeMB / STORAGE_LIMIT_MB) * 100).toFixed(1)}%)`,
    warningThreshold: `${warningMB}MB (70%)`,
    criticalThreshold: `${criticalMB}MB (90%)`,
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `Storage使用量が${severity === 'critical' ? 'Critical' : 'Warning'}閾値を超えています` : '',
  }
}

async function checkDbConnections(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  let activeConnections = 0

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_active_connections`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
        body: '{}',
      }
    )
    if (res.ok) {
      const result = await res.json()
      activeConnections = typeof result === 'number' ? result : (result?.count || 0)
    }
  } catch {
    activeConnections = 0
  }

  const warningCount = Math.floor(MAX_CONNECTIONS * 0.8)  // 48
  const criticalCount = Math.floor(MAX_CONNECTIONS * 0.95) // 57

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (activeConnections >= criticalCount) {
    severity = 'critical'
    action = 'アプリ再起動・不要な接続を切断'
  } else if (activeConnections >= warningCount) {
    severity = 'warning'
    action = '接続リーク有無を確認'
  }

  return {
    checkType: 'db_connections',
    label: 'Supabase DB接続数',
    currentValue: `${activeConnections} / ${MAX_CONNECTIONS} (${((activeConnections / MAX_CONNECTIONS) * 100).toFixed(1)}%)`,
    warningThreshold: `${warningCount} (80%)`,
    criticalThreshold: `${criticalCount} (95%)`,
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `DB接続数が${severity === 'critical' ? 'Critical' : 'Warning'}閾値を超えています` : '',
  }
}

async function checkEdgeFunctionInvocations(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  // Edge Function の月間呼び出し数は Supabase Management API 経由で取得が必要
  // ここではmonitoring_alertsテーブルの行数等から間接的に推定するか、
  // Management API を使用する
  // 現状はスキップ（将来のManagement API統合時に有効化）
  return {
    checkType: 'edge_functions',
    label: 'Edge Functions実行数',
    currentValue: '取得不可（Management API未統合）',
    warningThreshold: '月150万回',
    criticalThreshold: '月180万回',
    severity: 'ok',
    recommendedAction: '',
    message: '',
  }
}

async function checkAuthMAU(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  // 今月のアクティブユーザー数を集計
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  let mauCount = 0
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_monthly_active_users`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ since: firstOfMonth }),
      }
    )
    if (res.ok) {
      const result = await res.json()
      mauCount = typeof result === 'number' ? result : (result?.count || 0)
    }
  } catch {
    mauCount = 0
  }

  const warningCount = AUTH_MAU_LIMIT * 0.8  // 40,000
  const criticalCount = AUTH_MAU_LIMIT * 0.96 // 48,000

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (mauCount >= criticalCount) {
    severity = 'critical'
    action = '新規登録を一時停止するか判断'
  } else if (mauCount >= warningCount) {
    severity = 'warning'
    action = '想定を超えるユーザー増。プラン見直しを検討'
  }

  return {
    checkType: 'auth_mau',
    label: 'Supabase Auth MAU',
    currentValue: `${mauCount.toLocaleString()} / ${AUTH_MAU_LIMIT.toLocaleString()}`,
    warningThreshold: `${warningCount.toLocaleString()} (80%)`,
    criticalThreshold: `${criticalCount.toLocaleString()} (96%)`,
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `Auth MAUが${severity === 'critical' ? 'Critical' : 'Warning'}閾値を超えています` : '',
  }
}

async function checkStripeWebhookHealth(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  // payment_attempts テーブルから直近24時間の成功率を計算
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  let total = 0
  let succeeded = 0

  try {
    const { count: totalCount } = await supabase
      .from('payment_attempts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since)

    const { count: successCount } = await supabase
      .from('payment_attempts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('status', 'succeeded')

    total = totalCount || 0
    succeeded = successCount || 0
  } catch {
    // テーブルが存在しない場合はスキップ
  }

  // 決済が5件未満の場合はサンプル不足で正常扱い（誤検知防止）
  if (total < 5) {
    return {
      checkType: 'stripe_health',
      label: 'Stripe Webhook成功率',
      currentValue: `直近24時間の決済${total}件（サンプル不足のため判定スキップ）`,
      warningThreshold: '成功率 < 95%',
      criticalThreshold: '成功率 < 80%',
      severity: 'ok',
      recommendedAction: '',
      message: '',
    }
  }

  const successRate = (succeeded / total) * 100

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (successRate < 80) {
    severity = 'critical'
    action = 'Stripe障害の可能性。Stripe Status Page (https://status.stripe.com) を確認し、事業者に通知'
  } else if (successRate < 95) {
    severity = 'warning'
    action = 'Stripe Status Pageを確認。一時的なら経過観察'
  }

  return {
    checkType: 'stripe_health',
    label: 'Stripe Webhook成功率',
    currentValue: `${successRate.toFixed(1)}% (${succeeded}/${total} 直近24h)`,
    warningThreshold: '95%未満',
    criticalThreshold: '80%未満',
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `Stripe成功率が${severity === 'critical' ? 'Critical' : 'Warning'}閾値を下回っています` : '',
  }
}

function checkAccessTokenExpiry(): CheckResult {
  const now = new Date()
  const daysRemaining = Math.floor((ACCESS_TOKEN_EXPIRY.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (daysRemaining <= 7) {
    severity = 'critical'
    action = '1週間以内に必ず更新。手順: docs/api-key-rotation-guide.md 参照'
  } else if (daysRemaining <= 14) {
    severity = 'warning'
    action = '2週間以内に更新作業をスケジュール'
  }

  return {
    checkType: 'access_token_expiry',
    label: 'Access Token期限',
    currentValue: `残り${daysRemaining}日（期限: 2026-06-20）`,
    warningThreshold: '残り14日以内',
    criticalThreshold: '残り7日以内',
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `Access Tokenの期限が${severity === 'critical' ? '7日' : '14日'}以内に迫っています` : '',
  }
}

// --- M-10: Google Places API使用量チェック ---

async function checkGooglePlacesApiUsage(supabase: ReturnType<typeof createClient>): Promise<CheckResult> {
  // competitor_collection_config の is_active を確認
  const { data: activeConfigs } = await supabase
    .from('competitor_collection_config')
    .select('id')
    .eq('is_active', true)
    .limit(1)

  if (!activeConfigs || activeConfigs.length === 0) {
    return {
      checkType: 'google_places_api',
      label: 'M-10: Google Places API使用量',
      currentValue: '競合収集が無効（is_active=false）のためスキップ',
      warningThreshold: '$150/月',
      criticalThreshold: '$180/月',
      severity: 'ok',
      recommendedAction: '',
      message: '',
    }
  }

  // 今月のAPI呼び出し数を推定（competitor_storesのlast_collected_atから）
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // 今月更新された competitor_stores の数 = Place Details API 呼び出し数の概算
  const { count: detailsCalls } = await supabase
    .from('competitor_stores')
    .select('*', { count: 'exact', head: true })
    .gte('last_collected_at', firstOfMonth)

  // google_places の今月の更新数 = Nearby Search + Place Details (既存システム)
  const { count: placesCalls } = await supabase
    .from('google_places')
    .select('*', { count: 'exact', head: true })
    .gte('last_fetched_at', firstOfMonth)

  // collection_progress の今月完了数 = Nearby Search 呼び出し数（bg-collector）
  const { count: gridCalls } = await supabase
    .from('collection_progress')
    .select('*', { count: 'exact', head: true })
    .gte('fetched_at', firstOfMonth)

  // コスト推定
  // Nearby Search: $32/1,000 req
  // Place Details (Advanced): $25/1,000 req
  const nearbySearchCalls = (gridCalls || 0) + Math.ceil((detailsCalls || 0) / 20) // competitor nearby calls
  const placeDetailsCalls = (detailsCalls || 0) + Math.ceil((placesCalls || 0) * 0.1) // reviews-collector details
  const estimatedCost = (nearbySearchCalls * 0.032) + (placeDetailsCalls * 0.025)

  const warningCost = 150
  const criticalCost = 180

  let severity: 'ok' | 'warning' | 'critical' = 'ok'
  let action = ''
  if (estimatedCost >= criticalCost) {
    severity = 'critical'
    action = '即座にAPI使用量を削減: (1) bg-collectorの日次リクエスト上限を下げる (2) competitor収集を隔週に変更 (3) Place Detailsのfieldsをbasicのみに絞る'
  } else if (estimatedCost >= warningCost) {
    severity = 'warning'
    action = 'Google Places APIの月間使用量が増加中。bg-collectorのリクエスト上限の調整を検討'
  }

  return {
    checkType: 'google_places_api',
    label: 'M-10: Google Places API使用量',
    currentValue: `推定$${estimatedCost.toFixed(1)}/月 (Nearby: ${nearbySearchCalls}回, Details: ${placeDetailsCalls}回)`,
    warningThreshold: `$${warningCost}/月`,
    criticalThreshold: `$${criticalCost}/月`,
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `Google Places APIの推定コストが${severity === 'critical' ? 'Critical' : 'Warning'}閾値を超えています` : '',
  }
}

// --- M-08: 設定整合性チェック ---

async function checkConfigConsistency(supabase: ReturnType<typeof createClient>): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // A. Access Token期限の整合性（自己チェック）
  // ACCESS_TOKEN_EXPIRY定数が妥当な値か（過去の日付になっていないか、極端に遠くないか）
  {
    const now = new Date()
    const daysUntilExpiry = Math.floor((ACCESS_TOKEN_EXPIRY.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    let severity: 'ok' | 'warning' | 'critical' = 'ok'
    let action = ''

    if (daysUntilExpiry < 0) {
      severity = 'critical'
      action = 'ACCESS_TOKEN_EXPIRY定数が過去の日付です。Edge Functionのコードを更新し再デプロイしてください。connection-info.md参照。'
    } else if (daysUntilExpiry > 365) {
      severity = 'warning'
      action = 'ACCESS_TOKEN_EXPIRY定数が1年以上先です。正しい値か確認してください。connection-info.md参照。'
    }

    results.push({
      checkType: 'config_token_expiry',
      label: 'M-08a: Token期限定数の整合性',
      currentValue: `ACCESS_TOKEN_EXPIRY = ${ACCESS_TOKEN_EXPIRY.toISOString().split('T')[0]}（残り${daysUntilExpiry}日）`,
      warningThreshold: '期限が1年以上先',
      criticalThreshold: '期限が過去の日付',
      severity,
      recommendedAction: action,
      message: severity !== 'ok' ? `ACCESS_TOKEN_EXPIRY定数に不整合があります` : '',
    })
  }

  // B. Supabase Anon Keyの有効性確認
  {
    let severity: 'ok' | 'warning' | 'critical' = 'ok'
    let action = ''
    let value = ''

    if (!SUPABASE_ANON_KEY) {
      severity = 'warning'
      value = 'SUPABASE_ANON_KEY未設定（チェックスキップ）'
      action = 'Edge FunctionのSecretsにSUPABASE_ANON_KEYを設定してください'
    } else {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/stores?select=id&limit=1`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        )
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            value = `正常（storesテーブルからデータ取得成功）`
          } else {
            // データが0件でも200が返ればkey自体は有効
            value = `正常（anon keyは有効、storesデータ0件）`
          }
        } else {
          severity = 'critical'
          value = `HTTPエラー ${res.status}`
          action = 'Supabase Anon Keyが無効です。Supabase DashboardでKeyを確認し、connection-info.mdと照合してください。'
        }
      } catch (err) {
        severity = 'critical'
        value = `接続エラー: ${(err as Error).message}`
        action = 'Supabase APIに接続できません。URLとAnon Keyを確認してください。'
      }
    }

    results.push({
      checkType: 'config_anon_key',
      label: 'M-08b: Anon Key有効性',
      currentValue: value,
      warningThreshold: 'Key未設定',
      criticalThreshold: 'Keyが無効またはAPI接続エラー',
      severity,
      recommendedAction: action,
      message: severity !== 'ok' ? `Anon Keyの有効性チェックで問題を検出` : '',
    })
  }

  // C. Edge Functionsデプロイ状態確認（Management API）
  {
    let severity: 'ok' | 'warning' | 'critical' = 'ok'
    let action = ''
    let value = ''

    // Supabase Management APIはAccess Tokenが必要
    // Edge Function内からはアクセスできないため、M-04同様スキップ
    value = '取得不可（Management API未統合、スキップ）'

    results.push({
      checkType: 'config_edge_functions',
      label: 'M-08c: Edge Functionsデプロイ状態',
      currentValue: value,
      warningThreshold: '主要Functionが欠落',
      criticalThreshold: '複数のCritical Functionが欠落',
      severity,
      recommendedAction: action,
      message: '',
    })
  }

  // D. 本番URL応答確認
  {
    let severity: 'ok' | 'warning' | 'critical' = 'ok'
    let action = ''
    let value = ''

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒タイムアウト

      const res = await fetch(PRODUCTION_URL, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        value = `HTTP ${res.status}（正常）`
      } else {
        severity = 'critical'
        value = `HTTP ${res.status}`
        action = `本番URL（${PRODUCTION_URL}）がHTTP ${res.status}を返しています。Vercel Dashboardを確認してください。`
      }
    } catch (err) {
      const errMsg = (err as Error).message
      if (errMsg.includes('abort') || errMsg.includes('timeout')) {
        severity = 'warning'
        value = `タイムアウト（10秒）`
        action = `本番URLへのアクセスがタイムアウトしました。ネットワーク状態を確認してください。`
      } else {
        // Edge Functionからの外部fetchがブロックされる場合はスキップ
        value = `チェックスキップ（${errMsg}）`
      }
    }

    results.push({
      checkType: 'config_production_url',
      label: 'M-08d: 本番URL応答',
      currentValue: value,
      warningThreshold: 'タイムアウト',
      criticalThreshold: 'HTTP 200以外',
      severity,
      recommendedAction: action,
      message: severity !== 'ok' ? `本番URLの応答に問題があります` : '',
    })
  }

  return results
}

// --- メール送信 ---

function formatJST(date: Date): string {
  return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function sendAlertEmail(
  severity: 'warning' | 'critical',
  label: string,
  currentValue: string,
  thresholdValue: string,
  recommendedAction: string,
): Promise<boolean> {
  if (!ALERT_EMAIL_TO || !RESEND_API_KEY) {
    console.warn('ALERT_EMAIL_TO or RESEND_API_KEY not set, skipping email')
    return false
  }

  const now = formatJST(new Date())
  const icon = severity === 'critical' ? '🚨' : '⚠️'
  const urgency = severity === 'critical' ? '【要即対応】' : ''

  const subject = `${icon} [AIden監視] ${label} が${severity === 'critical' ? 'Critical' : 'Warning'}閾値を超えました${urgency}`

  const riskNote = severity === 'critical'
    ? `<tr><td style="padding:16px;background:#FFF3F3;border-radius:8px;margin-top:16px;">
        <p style="margin:0;color:#D32F2F;font-size:14px;font-weight:700;">⚠️ サービス停止リスクがあります。速やかに対応してください。</p>
       </td></tr>`
    : ''

  const html = buildAlertEmailHtml({
    title: `${icon} ${severity === 'critical' ? 'Critical' : 'Warning'} アラート`,
    headerColor: severity === 'critical' ? '#D32F2F' : '#F57C00',
    rows: [
      { label: '検知時刻', value: `${now} JST` },
      { label: '項目', value: label },
      { label: '現在の値', value: currentValue },
      { label: `${severity === 'critical' ? 'Critical' : 'Warning'}閾値`, value: thresholdValue },
    ],
    recommendedAction,
    footer: 'この問題が解消されるまで同じアラートは再送されません。',
    extraHtml: riskNote,
  })

  return await sendEmail(subject, html)
}

async function sendRecoveryEmail(label: string, currentValue: string): Promise<boolean> {
  if (!ALERT_EMAIL_TO || !RESEND_API_KEY) return false

  const now = formatJST(new Date())
  const subject = `✅ [AIden監視] ${label} が正常に戻りました`

  const html = buildAlertEmailHtml({
    title: '✅ 復旧通知',
    headerColor: '#2E7D32',
    rows: [
      { label: '復旧時刻', value: `${now} JST` },
      { label: '項目', value: label },
      { label: '現在の値', value: currentValue },
    ],
    recommendedAction: '',
    footer: '',
    extraHtml: '',
  })

  return await sendEmail(subject, html)
}

function buildAlertEmailHtml(opts: {
  title: string
  headerColor: string
  rows: { label: string; value: string }[]
  recommendedAction: string
  footer: string
  extraHtml: string
}): string {
  const rowsHtml = opts.rows.map(r => `
    <tr>
      <td style="padding:8px 16px;font-size:13px;color:#888;width:120px;vertical-align:top;">${r.label}</td>
      <td style="padding:8px 16px;font-size:14px;color:#333;font-weight:600;">${r.value}</td>
    </tr>
  `).join('')

  const actionHtml = opts.recommendedAction ? `
    <tr><td colspan="2" style="padding:16px;">
      <div style="background:#F5F5F5;border-radius:8px;padding:16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#888;font-weight:600;">推奨対策</p>
        <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">${opts.recommendedAction}</p>
      </div>
    </td></tr>
  ` : ''

  return `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${opts.headerColor};padding:24px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;">AIden 監視システム</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${opts.title}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rowsHtml}
              ${actionHtml}
              ${opts.extraHtml}
            </table>
          </td>
        </tr>
        ${opts.footer ? `
        <tr>
          <td style="padding:0 32px 24px;">
            <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">※ ${opts.footer}</p>
          </td>
        </tr>` : ''}
        <tr>
          <td style="background:#fafafa;padding:16px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:11px;color:#aaa;">&copy; AIden監視システム - 自動送信</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [ALERT_EMAIL_TO],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend API error:', err)
      return false
    }
    return true
  } catch (err) {
    console.error('Email send error:', err)
    return false
  }
}

// --- メイン処理 ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 全チェックを並列実行
    const results = await Promise.allSettled([
      checkDbSize(supabase),
      checkStorageUsage(supabase),
      checkDbConnections(supabase),
      checkEdgeFunctionInvocations(supabase),
      checkAuthMAU(supabase),
      checkStripeWebhookHealth(supabase),
      Promise.resolve(checkAccessTokenExpiry()),
      checkConfigConsistency(supabase),
      checkGooglePlacesApiUsage(supabase),
    ])

    const checks: CheckResult[] = []
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      // checkConfigConsistency returns CheckResult[], others return CheckResult
      if (Array.isArray(r.value)) {
        checks.push(...r.value)
      } else {
        checks.push(r.value)
      }
    }

    // 既存の未解決アラートを取得
    const { data: existingAlerts } = await supabase
      .from('monitoring_alerts')
      .select('id, check_type, severity, resolved_at')
      .is('resolved_at', null)

    const unresolvedAlerts: MonitoringAlert[] = existingAlerts || []

    const summary = {
      checked: checks.length,
      warnings: 0,
      criticals: 0,
      emails_sent: 0,
      recovered: 0,
    }

    for (const check of checks) {
      if (check.severity === 'ok') {
        // 以前アラートが出ていたが今は正常 → 復旧処理
        const existing = unresolvedAlerts.filter(a => a.check_type === check.checkType)
        for (const alert of existing) {
          await supabase
            .from('monitoring_alerts')
            .update({ resolved_at: new Date().toISOString() })
            .eq('id', alert.id)

          const sent = await sendRecoveryEmail(check.label, check.currentValue)
          if (sent) summary.emails_sent++
          summary.recovered++
        }
        continue
      }

      // Warning or Critical
      if (check.severity === 'warning') summary.warnings++
      if (check.severity === 'critical') summary.criticals++

      // 重複チェック: 同じcheck_type + severity で未解決のアラートがあればスキップ
      const duplicate = unresolvedAlerts.find(
        a => a.check_type === check.checkType && a.severity === check.severity
      )
      if (duplicate) {
        continue // 重複送信しない
      }

      // severity がエスカレートした場合（warning → critical）: 既存のwarningを解決して新規critical作成
      const lowerSeverityAlert = unresolvedAlerts.find(
        a => a.check_type === check.checkType && a.severity === 'warning' && check.severity === 'critical'
      )
      if (lowerSeverityAlert) {
        await supabase
          .from('monitoring_alerts')
          .update({ resolved_at: new Date().toISOString() })
          .eq('id', lowerSeverityAlert.id)
      }

      // アラート記録
      await supabase.from('monitoring_alerts').insert({
        check_type: check.checkType,
        severity: check.severity,
        current_value: check.currentValue,
        threshold_value: check.severity === 'critical' ? check.criticalThreshold : check.warningThreshold,
        message: check.message,
        recommended_action: check.recommendedAction,
      })

      // メール送信
      const sent = await sendAlertEmail(
        check.severity,
        check.label,
        check.currentValue,
        check.severity === 'critical' ? check.criticalThreshold : check.warningThreshold,
        check.recommendedAction,
      )
      if (sent) summary.emails_sent++
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        summary,
        checks: checks.map(c => ({
          type: c.checkType,
          label: c.label,
          severity: c.severity,
          value: c.currentValue,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Monitor usage error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
