// CC-22b-stage1: Generation worker (service-role-only, invoked by start-generation).
// - Fetches job + template_reviews for cuisine_key
// - Calls Claude API 3x in parallel with per-call retry (2 retries, exponential backoff)
// - Inserts 3 generation_results rows on success
// - Updates generation_jobs.status to 'completed' or 'failed' with error_code
// - Logs to ai_usage_logs

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logAiUsage } from '../_shared/ai-usage-log.ts'
import { buildReviewReplyPrompt, MODEL_NAME, BrandSnapshot } from './prompt.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('AIDEN_SERVICE_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const MAX_RETRIES = 2
const CLAUDE_TIMEOUT_MS = 25_000
const MAX_TOKENS = 400

interface TemplateReview {
  id: string
  cuisine_key: string
  review_text: string
  seq: number
}

interface ReplyContent {
  reply_text: string
  source_review: string
  tone_used: string
  model: string
  generated_at: string
  prompt_tokens: number
  completion_tokens: number
}

serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || ''
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let jobId: string | undefined
  try {
    const body = await req.json()
    jobId = body.job_id
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    await processJob(sb, jobId)

    return new Response(JSON.stringify({ ok: true, job_id: jobId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generation-worker] fatal:', err)
    return new Response(JSON.stringify({ error: String(err), job_id: jobId }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function processJob(sb: SupabaseClient, jobId: string): Promise<void> {
  const { data: job, error: fetchErr } = await sb
    .from('generation_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .select()
    .single()

  if (fetchErr || !job) {
    throw new Error(`job_fetch_failed: ${fetchErr?.message || 'not found'}`)
  }

  const brandSnapshot: BrandSnapshot = (job.brand_snapshot as BrandSnapshot) || {}

  try {
    const { data: reviews, error: revErr } = await sb
      .from('template_reviews')
      .select('*')
      .eq('cuisine_key', job.cuisine_key)
      .order('seq')

    if (revErr) throw new Error(`template_fetch_failed: ${revErr.message}`)
    if (!reviews || reviews.length !== 3) {
      throw new Error(`no_template: expected 3 for ${job.cuisine_key}, got ${reviews?.length ?? 0}`)
    }

    const results = await Promise.all(
      (reviews as TemplateReview[]).map((r) =>
        generateWithRetry(sb, jobId, brandSnapshot, job.tone, r),
      ),
    )

    const resultRows = results.map((content, idx) => ({
      job_id: jobId,
      result_type: 'review_reply',
      content,
      tone: job.tone,
      seq: (reviews as TemplateReview[])[idx].seq,
    }))

    const { error: insErr } = await sb.from('generation_results').insert(resultRows)
    if (insErr) throw new Error(`results_insert_failed: ${insErr.message}`)

    await sb
      .from('generation_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', jobId)

    const totalInput = results.reduce((s, r) => s + (r.prompt_tokens || 0), 0)
    const totalOutput = results.reduce((s, r) => s + (r.completion_tokens || 0), 0)
    await logAiUsage(sb, {
      venue_id: job.venue_id,
      brand_id: job.brand_id,
      feature: 'review_reply_onboarding_preview',
      model: MODEL_NAME,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      status: 'success',
      metadata: { cuisine_key: job.cuisine_key, tone: job.tone, job_id: jobId },
    })
  } catch (error) {
    const code = classifyError(error)
    const msg = error instanceof Error ? error.message : String(error)

    await sb
      .from('generation_jobs')
      .update({
        status: 'failed',
        error_code: code,
        error_message: msg.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    await logAiUsage(sb, {
      venue_id: job.venue_id,
      brand_id: job.brand_id,
      feature: 'review_reply_onboarding_preview',
      model: MODEL_NAME,
      status: 'error',
      error_message: msg,
      metadata: { cuisine_key: job.cuisine_key, tone: job.tone, job_id: jobId, error_code: code },
    })

    throw error
  }
}

function classifyError(error: unknown): string {
  if (error instanceof Error) {
    const m = error.message
    if (m.startsWith('no_template:')) return 'no_template'
    if (m.startsWith('template_fetch_failed:')) return 'no_template'
    if (m.startsWith('results_insert_failed:')) return 'db_error'
    if (m.startsWith('job_fetch_failed:')) return 'db_error'
    if (error.name === 'AbortError' || m.includes('timeout')) return 'timeout'
    if (m.includes('claude_api_error')) return 'claude_api_error'
  }
  return 'unknown_error'
}

async function generateWithRetry(
  sb: SupabaseClient,
  jobId: string,
  brand: BrandSnapshot,
  tone: string,
  review: TemplateReview,
): Promise<ReplyContent> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callClaudeAPI(brand, tone, review)
    } catch (err) {
      lastError = err
      if (attempt === MAX_RETRIES) break

      await sb.from('generation_jobs').update({ retry_count: attempt + 1 }).eq('id', jobId)
      await sleep(1000 * Math.pow(2, attempt))
    }
  }

  throw lastError
}

async function callClaudeAPI(
  brand: BrandSnapshot,
  tone: string,
  review: TemplateReview,
): Promise<ReplyContent> {
  const { systemPrompt, userPrompt } = buildReviewReplyPrompt(brand, tone, review.review_text)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`claude_api_error: ${res.status} ${txt.slice(0, 200)}`)
    }

    const data = await res.json()
    const replyText = (data.content?.[0]?.text || '').trim()
    if (!replyText) throw new Error('claude_api_error: empty response')

    return {
      reply_text: replyText,
      source_review: review.review_text,
      tone_used: tone,
      model: MODEL_NAME,
      generated_at: new Date().toISOString(),
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
