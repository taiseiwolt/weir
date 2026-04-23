// CC-22b-stage1: Start AI generation job (trigger-only, non-blocking).
// - Validates input + runs rate limit check (venue / session / IP)
// - Inserts generation_jobs row
// - Fire-and-forget invokes generation-worker
// - Returns 202 with job_id for client Realtime subscribe

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  corsPreflightResponse,
  sanitizeErrorMessage,
} from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const RATE_LIMIT_VENUE_PER_MIN = 3
const RATE_LIMIT_SESSION_PER_MIN = 3
const RATE_LIMIT_IP_PER_MIN = 10

const CUISINE_KEY_RE = /^(warmth|modern|premium|casual)-[1-4]$/
const VALID_TONES = new Set(['warmth', 'modern', 'premium', 'casual'])

interface StartGenerationRequest {
  session_id?: string
  venue_id?: string
  cuisine_key: string
  tone: string
  brand_snapshot?: {
    brand_name?: string
    concept?: string
    cuisine_label?: string
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const body = (await req.json()) as StartGenerationRequest

    if (!body.cuisine_key || !CUISINE_KEY_RE.test(body.cuisine_key)) {
      return json({ error: 'cuisine_key が不正です' }, 400, jsonHeaders)
    }
    if (!body.tone || !VALID_TONES.has(body.tone)) {
      return json({ error: 'tone が不正です' }, 400, jsonHeaders)
    }
    if (!body.venue_id && !body.session_id) {
      return json({ error: 'venue_id または session_id が必要です' }, 400, jsonHeaders)
    }

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY)
    const ip = extractClientIp(req)

    const limitMsg = await checkRateLimit(sbAdmin, body, ip)
    if (limitMsg) {
      return json({ error: limitMsg, status: 'rate_limited' }, 429, jsonHeaders)
    }

    const { data: job, error: insErr } = await sbAdmin
      .from('generation_jobs')
      .insert({
        venue_id: body.venue_id ?? null,
        session_id: body.session_id ?? null,
        job_type: 'review_reply',
        cuisine_key: body.cuisine_key,
        tone: body.tone,
        brand_snapshot: body.brand_snapshot ?? {},
        status: 'pending',
      })
      .select('id')
      .single()

    if (insErr || !job) {
      console.error('[start-generation] insert failed:', insErr)
      return json({ error: 'ジョブ作成に失敗しました' }, 500, jsonHeaders)
    }

    await recordRateLimit(sbAdmin, body, ip)

    triggerWorker(job.id)

    return json({ job_id: job.id, status: 'pending' }, 202, jsonHeaders)
  } catch (err) {
    console.error('[start-generation] error:', err)
    return json({ error: sanitizeErrorMessage(err) }, 500, jsonHeaders)
  }
})

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

function extractClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown'
}

async function checkRateLimit(
  sb: SupabaseClient,
  body: StartGenerationRequest,
  ip: string,
): Promise<string | null> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()

  if (body.venue_id) {
    const { count } = await sb
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('key_type', 'venue')
      .eq('key_value', body.venue_id)
      .gte('called_at', oneMinuteAgo)
    if ((count ?? 0) >= RATE_LIMIT_VENUE_PER_MIN) {
      return '同じ店舗から短時間に複数回のリクエストがありました。少し時間を置いてください'
    }
  }

  if (body.session_id) {
    const { count } = await sb
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('key_type', 'session')
      .eq('key_value', body.session_id)
      .gte('called_at', oneMinuteAgo)
    if ((count ?? 0) >= RATE_LIMIT_SESSION_PER_MIN) {
      return '短時間に複数回のリクエストがありました。少し時間を置いてください'
    }
  }

  const { count: ipCount } = await sb
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('key_type', 'ip')
    .eq('key_value', ip)
    .gte('called_at', oneMinuteAgo)
  if ((ipCount ?? 0) >= RATE_LIMIT_IP_PER_MIN) {
    return 'アクセスが集中しています。少し時間を置いてください'
  }

  return null
}

async function recordRateLimit(
  sb: SupabaseClient,
  body: StartGenerationRequest,
  ip: string,
): Promise<void> {
  const rows: Array<{ key_type: string; key_value: string }> = []
  if (body.venue_id) rows.push({ key_type: 'venue', key_value: body.venue_id })
  if (body.session_id) rows.push({ key_type: 'session', key_value: body.session_id })
  rows.push({ key_type: 'ip', key_value: ip })

  const { error } = await sb.from('rate_limits').insert(rows)
  if (error) console.error('[start-generation] rate_limits insert failed:', error)
}

function triggerWorker(jobId: string): void {
  const url = `${SUPABASE_URL}/functions/v1/generation-worker`
  const promise = fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((err) => {
    console.error('[start-generation] worker trigger failed:', err)
  })

  // Supabase EF: keep instance alive until worker fetch is dispatched.
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(promise)
}
