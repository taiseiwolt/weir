// Supabase Edge Function: google-reviews-collector
// POST /functions/v1/google-reviews-collector
//
// 加盟店のGoogle口コミを自動収集し、競合店の口コミも取得する
//
// 環境変数（Supabase Dashboard > Edge Functions > Secrets で設定）:
//   GOOGLE_MAPS_API_KEY: Google Places API (New) のAPIキー
//   SUPABASE_URL: 自動設定
//   SUPABASE_SERVICE_ROLE_KEY: 自動設定

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { getCorsHeaders, corsPreflightResponse, requireAuthOrServiceRole, sanitizeErrorMessage } from '../_shared/auth.ts'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const NEARBY_RADIUS_METERS = 3000
const MAX_COMPETITOR_DETAILS = 10 // 競合のPlace Details取得上限（コスト制御）

// --- Google Places API (New) helpers ---

interface PlaceDetails {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  types?: string[]
  businessStatus?: string
  reviews?: GoogleReview[]
}

interface GoogleReview {
  name: string
  relativePublishTimeDescription?: string
  rating: number
  text?: { text: string; languageCode: string }
  originalText?: { text: string; languageCode: string }
  authorAttribution?: { displayName: string }
  publishTime?: string
}

interface NearbyPlace {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  types?: string[]
  businessStatus?: string
}

/** Place Details (New) API でレビュー含む詳細を取得 */
async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const fields = 'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,businessStatus,reviews'
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&languageCode=ja`

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': fields,
    },
  })

  if (!res.ok) {
    console.error(`Place Details failed for ${placeId}: ${res.status} ${await res.text()}`)
    return null
  }

  return await res.json()
}

/** Nearby Search (New) API で周辺の同業態店舗を検索 */
async function nearbySearch(lat: number, lng: number, includedTypes: string[]): Promise<NearbyPlace[]> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby'
  const body = {
    includedTypes: includedTypes.length > 0 ? includedTypes : ['restaurant'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: NEARBY_RADIUS_METERS,
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
    console.error(`Nearby Search failed: ${res.status} ${await res.text()}`)
    return []
  }

  const data = await res.json()
  return data.places || []
}

/** Haversine距離（メートル） */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  const corsHeaders = getCorsHeaders(req)

  // service_role認証（cron呼び出し）
  const authError = await requireAuthOrServiceRole(req, corsHeaders)
  if (authError) return authError

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // a. google_place_id を持つ全店舗を取得
    const { data: stores, error: storesErr } = await supabase
      .from('venues')
      .select('id, name, google_place_id, latitude, longitude, genre')
      .not('google_place_id', 'is', null)

    if (storesErr) throw storesErr
    if (!stores || stores.length === 0) {
      return new Response(JSON.stringify({ message: 'No stores with google_place_id found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = {
      stores_processed: 0,
      reviews_inserted: 0,
      competitors_found: 0,
      alerts_created: 0,
      errors: [] as string[],
    }

    for (const store of stores) {
      try {
        // b. 自店のPlace Details取得（口コミ5件、NEWEST順）
        const details = await getPlaceDetails(store.google_place_id)
        if (!details) {
          results.errors.push(`Place Details failed for store ${store.name}`)
          continue
        }

        // google_places にUPSERT（自店も記録）
        await supabase.from('google_places').upsert({
          place_id: details.id,
          name: details.displayName?.text || store.name,
          address: details.formattedAddress,
          lat: details.location?.latitude,
          lng: details.location?.longitude,
          rating: details.rating,
          user_ratings_total: details.userRatingCount || 0,
          price_level: parsePriceLevel(details.priceLevel),
          types: details.types || [],
          business_status: details.businessStatus,
          last_fetched_at: new Date().toISOString(),
        }, { onConflict: 'place_id' })

        // 口コミINSERT（重複スキップ）
        if (details.reviews && details.reviews.length > 0) {
          for (const review of details.reviews) {
            const publishedAt = review.publishTime || new Date().toISOString()
            const authorName = review.authorAttribution?.displayName || 'Anonymous'

            const { data: insertedReview, error: revErr } = await supabase
              .from('google_reviews')
              .upsert({
                place_id: details.id,
                author_name: authorName,
                rating: review.rating,
                text: review.originalText?.text || review.text?.text || null,
                language: review.originalText?.languageCode || review.text?.languageCode || 'ja',
                relative_time_description: review.relativePublishTimeDescription,
                published_at: publishedAt,
                fetched_at: new Date().toISOString(),
              }, {
                onConflict: 'place_id,author_name,published_at',
                ignoreDuplicates: true,
              })
              .select('id')
              .single()

            if (!revErr && insertedReview) {
              results.reviews_inserted++

              // ネガティブ口コミアラート（rating <= 2）
              if (review.rating <= 2) {
                await supabase.from('review_alerts').upsert({
                  venue_id: store.id,
                  google_review_id: insertedReview.id,
                  is_read: false,
                }, { onConflict: 'google_review_id', ignoreDuplicates: true })
                results.alerts_created++
              }
            }
          }
        }

        // c. 半径3kmでNearby Search（同じtypeでフィルタ）
        const lat = details.location?.latitude || store.latitude
        const lng = details.location?.longitude || store.longitude
        if (!lat || !lng) continue

        const storeTypes = (details.types || []).filter((t: string) =>
          ['restaurant', 'meal_delivery', 'meal_takeaway', 'cafe', 'bakery', 'bar'].includes(t)
        )

        const nearbyPlaces = await nearbySearch(lat, lng, storeTypes)
        // 自店を除外
        const competitors = nearbyPlaces.filter(p => p.id !== store.google_place_id)
        results.competitors_found += competitors.length

        // google_places にUPSERT
        for (const comp of competitors) {
          await supabase.from('google_places').upsert({
            place_id: comp.id,
            name: comp.displayName?.text || '',
            address: comp.formattedAddress,
            lat: comp.location?.latitude,
            lng: comp.location?.longitude,
            rating: comp.rating,
            user_ratings_total: comp.userRatingCount || 0,
            price_level: parsePriceLevel(comp.priceLevel),
            types: comp.types || [],
            business_status: comp.businessStatus,
            last_fetched_at: new Date().toISOString(),
          }, { onConflict: 'place_id' })
        }

        // d. 競合店舗のPlace Detailsも取得（上位N件のみ、コスト制御）
        const topCompetitors = competitors
          .sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0))
          .slice(0, MAX_COMPETITOR_DETAILS)

        for (const comp of topCompetitors) {
          const compDetails = await getPlaceDetails(comp.id)
          if (!compDetails) continue

          if (compDetails.reviews) {
            for (const review of compDetails.reviews) {
              const publishedAt = review.publishTime || new Date().toISOString()
              const authorName = review.authorAttribution?.displayName || 'Anonymous'

              const { error: compRevErr } = await supabase.from('google_reviews').upsert({
                place_id: compDetails.id,
                author_name: authorName,
                rating: review.rating,
                text: review.originalText?.text || review.text?.text || null,
                language: review.originalText?.languageCode || review.text?.languageCode || 'ja',
                relative_time_description: review.relativePublishTimeDescription,
                published_at: publishedAt,
                fetched_at: new Date().toISOString(),
              }, {
                onConflict: 'place_id,author_name,published_at',
                ignoreDuplicates: true,
              })

              if (!compRevErr) results.reviews_inserted++
            }
          }

          // e. competitor_mappings に紐づけINSERT
          const distance = haversineDistance(
            lat, lng,
            comp.location?.latitude || 0,
            comp.location?.longitude || 0
          )

          await supabase.from('competitor_mappings').upsert({
            venue_id: store.id,
            place_id: comp.id,
            distance_meters: Math.round(distance),
          }, { onConflict: 'venue_id,place_id', ignoreDuplicates: true })
        }

        results.stores_processed++
      } catch (storeError) {
        results.errors.push(`Error processing store ${store.name}: ${storeError}`)
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('google-reviews-collector error:', error)
    return new Response(JSON.stringify({ error: sanitizeErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
