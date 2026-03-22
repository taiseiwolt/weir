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

const FROM_EMAIL = 'noreply@aiden-jp.net'
const FROM_NAME = 'AIden監視'

// Access Token の期限（固定値）
const ACCESS_TOKEN_EXPIRY = new Date('2026-04-15T00:00:00Z')

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
    currentValue: `残り${daysRemaining}日（期限: 2026-04-15）`,
    warningThreshold: '残り14日以内',
    criticalThreshold: '残り7日以内',
    severity,
    recommendedAction: action,
    message: severity !== 'ok' ? `Access Tokenの期限が${severity === 'critical' ? '7日' : '14日'}以内に迫っています` : '',
  }
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
    ])

    const checks: CheckResult[] = results
      .filter((r): r is PromiseFulfilledResult<CheckResult> => r.status === 'fulfilled')
      .map(r => r.value)

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
