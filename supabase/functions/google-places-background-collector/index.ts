// Supabase Edge Function: google-places-background-collector
// POST /functions/v1/google-places-background-collector
//
// 都心9区の飲食店を順次収集（グリッド分割でNearby Search）
// 月$200の無料枠内で運用するため、1日あたりの上限リクエスト数を制御
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   GOOGLE_MAPS_API_KEY: Google Places API (New) のAPIキー
//   SUPABASE_URL: 自動設定
//   SUPABASE_SERVICE_ROLE_KEY: 自動設定

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_DAILY_REQUESTS = 200
const GRID_INTERVAL_DEG = 0.0045 // 約500m間隔

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 都心9区の境界ボックス（概算）
const WARD_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  '千代田区': { minLat: 35.670, maxLat: 35.700, minLng: 139.745, maxLng: 139.780 },
  '港区':     { minLat: 35.630, maxLat: 35.670, minLng: 139.720, maxLng: 139.770 },
  '中央区':   { minLat: 35.660, maxLat: 35.690, minLng: 139.760, maxLng: 139.790 },
  '新宿区':   { minLat: 35.685, maxLat: 35.720, minLng: 139.680, maxLng: 139.720 },
  '品川区':   { minLat: 35.600, maxLat: 35.640, minLng: 139.710, maxLng: 139.750 },
  '渋谷区':   { minLat: 35.645, maxLat: 35.675, minLng: 139.685, maxLng: 139.715 },
  '江東区':   { minLat: 35.640, maxLat: 35.690, minLng: 139.790, maxLng: 139.840 },
  '文京区':   { minLat: 35.705, maxLat: 35.730, minLng: 139.735, maxLng: 139.770 },
  '目黒区':   { minLat: 35.620, maxLat: 35.650, minLng: 139.670, maxLng: 139.710 },
}

const WARD_ORDER = ['千代田区', '港区', '中央区', '新宿区', '品川区', '渋谷区', '江東区', '文京区', '目黒区']

/** グリッドポイントを生成して collection_progress に登録 */
async function initGridForWard(supabase: ReturnType<typeof createClient>, ward: string) {
  const bounds = WARD_BOUNDS[ward]
  if (!bounds) return

  const points: { ward: string; grid_lat: number; grid_lng: number; status: string }[] = []

  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += GRID_INTERVAL_DEG) {
    for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += GRID_INTERVAL_DEG) {
      points.push({
        ward,
        grid_lat: Math.round(lat * 1000000) / 1000000,
        grid_lng: Math.round(lng * 1000000) / 1000000,
        status: 'pending',
      })
    }
  }

  if (points.length > 0) {
    await supabase.from('collection_progress').upsert(points, {
      onConflict: 'ward,grid_lat,grid_lng',
      ignoreDuplicates: true,
    })
  }

  return points.length
}

/** Nearby Search (New) API */
async function nearbySearch(lat: number, lng: number): Promise<any[]> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby'
  const body = {
    includedTypes: ['restaurant', 'cafe', 'bakery', 'meal_delivery', 'meal_takeaway', 'bar', 'izakaya'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 350, // 500mグリッドの対角線をカバー
      },
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.businessStatus',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error(`Nearby Search failed at (${lat},${lng}): ${res.status}`)
    return []
  }

  const data = await res.json()
  return data.places || []
}

/** priceLevelの文字列を数値に変換 */
function parsePriceLevel(pl?: string): number | null {
  if (!pl) return null
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  }
  return map[pl] ?? null
}

/** 住所から区名を推定 */
function inferWard(address?: string): string | null {
  if (!address) return null
  for (const ward of WARD_ORDER) {
    if (address.includes(ward)) return ward
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let requestCount = 0
    const results = {
      ward_processed: '',
      grids_completed: 0,
      places_upserted: 0,
      api_requests: 0,
    }

    // 現在処理中の区を特定（pendingが残っている最初の区）
    let currentWard: string | null = null

    for (const ward of WARD_ORDER) {
      // この区にpendingグリッドがあるか確認
      const { count } = await supabase
        .from('collection_progress')
        .select('*', { count: 'exact', head: true })
        .eq('ward', ward)
        .eq('status', 'pending')

      if (count === null) {
        // この区のグリッドが未初期化 → 初期化
        const gridCount = await initGridForWard(supabase, ward)
        console.log(`Initialized ${gridCount} grid points for ${ward}`)
        currentWard = ward
        break
      }

      if (count > 0) {
        currentWard = ward
        break
      }
      // count === 0 → この区は完了、次へ
    }

    if (!currentWard) {
      return new Response(JSON.stringify({
        message: 'All wards completed',
        ...results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    results.ward_processed = currentWard

    // pendingグリッドを取得（上限MAX_DAILY_REQUESTS件）
    const { data: pendingGrids, error: gridErr } = await supabase
      .from('collection_progress')
      .select('id, grid_lat, grid_lng')
      .eq('ward', currentWard)
      .eq('status', 'pending')
      .limit(MAX_DAILY_REQUESTS)

    if (gridErr) throw gridErr
    if (!pendingGrids || pendingGrids.length === 0) {
      return new Response(JSON.stringify({
        message: `No pending grids for ${currentWard}`,
        ...results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 各グリッドポイントでNearby Search
    for (const grid of pendingGrids) {
      if (requestCount >= MAX_DAILY_REQUESTS) break

      try {
        const places = await nearbySearch(grid.grid_lat, grid.grid_lng)
        requestCount++

        // google_places にUPSERT
        for (const place of places) {
          const ward = inferWard(place.formattedAddress) || currentWard

          await supabase.from('google_places').upsert({
            place_id: place.id,
            name: place.displayName?.text || '',
            address: place.formattedAddress,
            lat: place.location?.latitude,
            lng: place.location?.longitude,
            rating: place.rating,
            user_ratings_total: place.userRatingCount || 0,
            price_level: parsePriceLevel(place.priceLevel),
            types: place.types || [],
            business_status: place.businessStatus,
            ward,
            last_fetched_at: new Date().toISOString(),
          }, { onConflict: 'place_id' })

          results.places_upserted++
        }

        // グリッドを完了に更新
        await supabase
          .from('collection_progress')
          .update({ status: 'done', fetched_at: new Date().toISOString() })
          .eq('id', grid.id)

        results.grids_completed++
      } catch (gridError) {
        console.error(`Error processing grid (${grid.grid_lat},${grid.grid_lng}):`, gridError)
      }
    }

    results.api_requests = requestCount

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('google-places-background-collector error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
