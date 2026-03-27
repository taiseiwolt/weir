// Supabase Edge Function: get-reservations
// GET /functions/v1/get-reservations
//
// 店舗の予約一覧取得（ダッシュボード用）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // GET も許可するため CORS ヘッダーにメソッド追加
  corsHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'

  try {
    const url = new URL(req.url)
    const storeId = url.searchParams.get('store_id')
    const dateFrom = url.searchParams.get('date_from')
    const dateTo = url.searchParams.get('date_to')
    const status = url.searchParams.get('status')

    if (!storeId) {
      return new Response(
        JSON.stringify({ error: 'store_id は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let query = supabase
      .from('reservations')
      .select('*')
      .eq('store_id', storeId)
      .order('date', { ascending: true })
      .order('time', { ascending: true })

    if (dateFrom) {
      query = query.gte('date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('date', dateTo)
    }
    if (status) {
      // カンマ区切りで複数ステータス対応
      const statuses = status.split(',').map(s => s.trim())
      query = query.in('status', statuses)
    }

    const { data: reservations, error: fetchError } = await query

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      return new Response(
        JSON.stringify({ error: sanitizeErrorMessage(fetchError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        reservations: reservations || [],
        count: reservations?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('get-reservations error:', err)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
