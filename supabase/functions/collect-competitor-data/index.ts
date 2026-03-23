// Supabase Edge Function: collect-competitor-data
// POST /functions/v1/collect-competitor-data
//
// POC店舗周辺（半径1km）の飲食店をGoogle Places APIで収集し、
// competitor_stores / competitor_reviews / competitor_metrics_weekly に格納する。
// competitor_collection_config.is_active = true の場合のみ実行。
//
// 環境変数:
//   GOOGLE_MAPS_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_STORES = 500
const MAX_NEARBY_PER_REQUEST = 20

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Place Details で取得するフィールド（コスト最適化）
const PLACE_DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'types',
  'reviews',
  'currentOpeningHours',
  'websiteUri',
  'nationalPhoneNumber',
  'photos',
  'delivery',
  'dineIn',
  'takeout',
  'reservable',
].join(',')

interface PlaceDetails {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  types?: string[]
  reviews?: GoogleReview[]
  currentOpeningHours?: {
    openNow?: boolean
    periods?: Array<{
      open: { day: number; hour: number; minute: number }
      close?: { day: number; hour: number; minute: number }
    }>
    weekdayDescriptions?: string[]
  }
  websiteUri?: string
  nationalPhoneNumber?: string
  photos?: Array<{ name: string }>
  delivery?: boolean
  dineIn?: boolean
  takeout?: boolean
  reservable?: boolean
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

/** Nearby Search (New) API */
async function nearbySearch(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<any[]> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby'
  const body = {
    includedTypes: ['restaurant', 'cafe', 'bakery', 'meal_delivery', 'meal_takeaway', 'bar'],
    maxResultCount: MAX_NEARBY_PER_REQUEST,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types',
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

/** Place Details (New) API */
async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${PLACE_DETAILS_FIELDS}&languageCode=ja`

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': PLACE_DETAILS_FIELDS,
    },
  })

  if (!res.ok) {
    console.error(`Place Details failed for ${placeId}: ${res.status} ${await res.text()}`)
    return null
  }

  return await res.json()
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

/** 週の開始日（月曜）を取得 */
function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. アクティブな収集設定を取得
    const { data: configs, error: configErr } = await supabase
      .from('competitor_collection_config')
      .select('*')
      .eq('is_active', true)

    if (configErr) throw configErr

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({
        message: 'No active collection config found. Set is_active = true after POC store is determined.',
        stores_collected: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = {
      configs_processed: 0,
      nearby_api_calls: 0,
      details_api_calls: 0,
      stores_upserted: 0,
      reviews_inserted: 0,
      metrics_inserted: 0,
      errors: [] as string[],
    }

    for (const config of configs) {
      try {
        const centerLat = parseFloat(config.center_latitude)
        const centerLng = parseFloat(config.center_longitude)
        const radius = config.radius_meters || 1000

        // 2. Nearby Search で周辺飲食店を取得（グリッド分割で網羅的に）
        const allPlaceIds = new Set<string>()
        const gridPoints: { lat: number; lng: number }[] = []

        if (radius <= 500) {
          gridPoints.push({ lat: centerLat, lng: centerLng })
        } else {
          const gridStep = 0.0045 // ~500m
          const latRange = radius / 111000
          const lngRange = radius / (111000 * Math.cos(centerLat * Math.PI / 180))

          for (let lat = centerLat - latRange; lat <= centerLat + latRange; lat += gridStep) {
            for (let lng = centerLng - lngRange; lng <= centerLng + lngRange; lng += gridStep) {
              if (haversineDistance(centerLat, centerLng, lat, lng) <= radius) {
                gridPoints.push({ lat, lng })
              }
            }
          }
        }

        console.log(`Config ${config.label || config.id}: ${gridPoints.length} grid points for radius ${radius}m`)

        // 各グリッドポイントでNearby Search
        for (const point of gridPoints) {
          if (allPlaceIds.size >= MAX_STORES) break

          const searchRadius = Math.min(radius, 500)
          const places = await nearbySearch(point.lat, point.lng, searchRadius)
          results.nearby_api_calls++

          for (const place of places) {
            if (place.id) {
              allPlaceIds.add(place.id)
            }
          }
        }

        console.log(`Found ${allPlaceIds.size} unique places`)

        // 3. 各店舗の Place Details を取得して保存
        const weekStart = getWeekStart(new Date())
        let detailsProcessed = 0

        for (const placeId of allPlaceIds) {
          if (detailsProcessed >= MAX_STORES) break

          try {
            const details = await getPlaceDetails(placeId)
            results.details_api_calls++

            if (!details) {
              results.errors.push(`Place Details failed: ${placeId}`)
              continue
            }

            const placeLat = details.location?.latitude || 0
            const placeLng = details.location?.longitude || 0
            const distance = Math.round(haversineDistance(centerLat, centerLng, placeLat, placeLng))

            // competitor_stores に UPSERT
            const { data: upsertedStore, error: storeErr } = await supabase
              .from('competitor_stores')
              .upsert({
                google_place_id: details.id,
                name: details.displayName?.text || '',
                address: details.formattedAddress,
                latitude: placeLat,
                longitude: placeLng,
                price_level: parsePriceLevel(details.priceLevel),
                rating: details.rating,
                total_ratings: details.userRatingCount || 0,
                types: details.types || [],
                website: details.websiteUri,
                phone: details.nationalPhoneNumber,
                supports_takeout: details.takeout ?? null,
                supports_delivery: details.delivery ?? null,
                supports_dine_in: details.dineIn ?? null,
                supports_reservations: details.reservable ?? null,
                photo_count: details.photos?.length || 0,
                opening_hours: details.currentOpeningHours ? {
                  weekday_descriptions: details.currentOpeningHours.weekdayDescriptions,
                  periods: details.currentOpeningHours.periods,
                } : null,
                distance_from_poc_m: distance,
                last_collected_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'google_place_id' })
              .select('id')
              .single()

            if (storeErr) {
              results.errors.push(`Store upsert failed: ${details.id} - ${storeErr.message}`)
              continue
            }

            results.stores_upserted++
            const storeUuid = upsertedStore.id

            // レビューを competitor_reviews に INSERT
            let weekNewReviews = 0
            let weekRatingSum = 0

            if (details.reviews && details.reviews.length > 0) {
              for (const review of details.reviews) {
                const authorName = review.authorAttribution?.displayName || 'Anonymous'
                const reviewId = review.name || `${authorName}_${review.publishTime || ''}`

                const { error: revErr } = await supabase
                  .from('competitor_reviews')
                  .upsert({
                    competitor_store_id: storeUuid,
                    google_review_id: reviewId,
                    author_name: authorName,
                    rating: review.rating,
                    text: review.originalText?.text || review.text?.text || null,
                    language: review.originalText?.languageCode || review.text?.languageCode || 'ja',
                    published_at: review.publishTime || null,
                    collected_at: new Date().toISOString(),
                  }, {
                    onConflict: 'competitor_store_id,google_review_id',
                    ignoreDuplicates: true,
                  })

                if (!revErr) {
                  results.reviews_inserted++
                  weekNewReviews++
                  weekRatingSum += review.rating
                }
              }
            }

            // 週次メトリクス UPSERT
            const { error: metricErr } = await supabase
              .from('competitor_metrics_weekly')
              .upsert({
                competitor_store_id: storeUuid,
                week_start: weekStart,
                rating: details.rating,
                total_ratings: details.userRatingCount || 0,
                new_reviews_count: weekNewReviews,
                avg_review_rating: weekNewReviews > 0 ? Math.round((weekRatingSum / weekNewReviews) * 10) / 10 : null,
                price_level: parsePriceLevel(details.priceLevel),
                photo_count: details.photos?.length || 0,
              }, { onConflict: 'competitor_store_id,week_start' })

            if (!metricErr) results.metrics_inserted++

            detailsProcessed++

            // Rate limiting: 100ms delay between Place Details calls
            if (detailsProcessed % 10 === 0) {
              await new Promise(r => setTimeout(r, 100))
            }
          } catch (placeError) {
            results.errors.push(`Error processing place ${placeId}: ${placeError}`)
          }
        }

        results.configs_processed++
      } catch (configError) {
        results.errors.push(`Error processing config ${config.id}: ${configError}`)
      }
    }

    const totalApiCalls = results.nearby_api_calls + results.details_api_calls
    console.log(`Completed: ${results.stores_upserted} stores, ${results.reviews_inserted} reviews, ${totalApiCalls} API calls, ${results.errors.length} errors`)

    return new Response(JSON.stringify({
      ...results,
      total_api_calls: totalApiCalls,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('collect-competitor-data error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
