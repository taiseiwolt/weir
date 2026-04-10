// Supabase Edge Function: BANチェック
// POST /functions/v1/check-ban
//
// フロントエンドからのBANチェックリクエストを受け取り、
// service_roleでuser_bansテーブルを検索し、BAN/非BANの結果のみ返す。
// ※ user_bansの詳細情報（メールアドレス等）はフロントに露出させない。

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, corsPreflightResponse } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { email, phone, member_id, store_id, brand_id, service_type } = body

    if (!email && !phone && !member_id) {
      return new Response(
        JSON.stringify({ banned: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // store_id から corporation_id, brand_id を逆引き（brand_id未指定時）
    let corporationId: string | null = null
    let resolvedBrandId: string | null = brand_id || null

    if (store_id) {
      const { data: storeRow } = await sbAdmin
        .from('venues')
        .select('brand_id, brands!inner(merchant_id)')
        .eq('id', store_id)
        .single()

      if (storeRow) {
        resolvedBrandId = resolvedBrandId || storeRow.brand_id
        corporationId = (storeRow.brands as any)?.merchant_id || null
      }
    }

    // OR条件でターゲットを検索
    const orConditions: string[] = []
    if (member_id) orConditions.push(`and(target_type.eq.member,target_id.eq.${member_id})`)
    if (email) orConditions.push(`and(target_type.eq.guest,target_email.eq.${email})`)
    if (phone) orConditions.push(`and(target_type.eq.guest,target_phone.eq.${phone})`)

    const { data: banHits, error } = await sbAdmin
      .from('user_bans')
      .select('id, scope_type, scope_id, ban_type, banned_services')
      .eq('is_active', true)
      .or(orConditions.join(','))

    if (error) {
      console.error('BAN check query error:', error.message)
      return new Response(
        JSON.stringify({ banned: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!banHits || banHits.length === 0) {
      return new Response(
        JSON.stringify({ banned: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // スコープフィルタ
    const applicable = banHits.filter((ban) => {
      // スコープチェック
      const scopeMatch =
        ban.scope_type === 'global' ||
        (ban.scope_type === 'corporation' && ban.scope_id === corporationId) ||
        (ban.scope_type === 'brand' && ban.scope_id === resolvedBrandId) ||
        (ban.scope_type === 'store' && ban.scope_id === store_id)

      if (!scopeMatch) return false

      // サービスタイプチェック
      if (ban.ban_type === 'all_except_dinein') return true
      if (ban.ban_type === 'service_specific' && service_type) {
        const services = ban.banned_services || []
        return Array.isArray(services) && services.includes(service_type)
      }

      return false
    })

    if (applicable.length > 0) {
      return new Response(
        JSON.stringify({ banned: true, message: 'このサービスはご利用いただけません' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ banned: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('check-ban error:', err)
    // BANチェック失敗は注文をブロックしない
    return new Response(
      JSON.stringify({ banned: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
