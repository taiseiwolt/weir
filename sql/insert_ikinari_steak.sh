#!/bin/bash
# いきなり！ステーキ デモデータ投入スクリプト
set -e

BASE_URL="https://iikwusprydaogzeslgdz.supabase.co/rest/v1"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3d1c3ByeWRhb2d6ZXNsZ2R6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU3NDU1NiwiZXhwIjoyMDg3MTUwNTU2fQ.ShAWlGjCfxNW10BkZOEQ13OwwJJyJScozFP8RB2Mj50"

post() {
  local table=$1
  local data=$2
  local result
  result=$(curl -s -w "\n%{http_code}" "${BASE_URL}/${table}" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "${data}")
  local http_code
  http_code=$(echo "$result" | tail -1)
  local body
  body=$(echo "$result" | sed '$d')
  if [[ "$http_code" != "201" ]]; then
    echo "ERROR inserting into ${table}: HTTP ${http_code}"
    echo "$body"
    exit 1
  fi
  echo "OK: ${table} (HTTP ${http_code})"
}

# ===== UUIDs =====
BRAND_ID="22222222-0000-0000-0000-000000000002"
CORP_ID="11111111-0000-0000-0000-000000000002"

STORE_SHIBUYA="0e68b622-94fa-4832-b904-71140caf2bd3"
STORE_KANDA="6f2f6146-d258-480a-a0d8-c89345f64044"
STORE_SHINBASHI="e2cf6b39-7e5d-41cc-9a39-50ab9cf78290"
STORE_IKEBUKURO="6dd7b03f-eb79-4082-97fb-d53113745c46"
STORE_YAESU="71433d1e-8c01-49d2-b534-928174d8d179"

CAT_LUNCH="44444444-0000-0000-0000-000000000011"
CAT_GRAND="44444444-0000-0000-0000-000000000012"
CAT_SET="44444444-0000-0000-0000-000000000013"
CAT_TOPPING="44444444-0000-0000-0000-000000000014"
CAT_DRINK="44444444-0000-0000-0000-000000000015"

# Product UUIDs (P prefix = product)
P01="55555555-0001-0000-0000-000000000001"
P02="55555555-0001-0000-0000-000000000002"
P03="55555555-0001-0000-0000-000000000003"
P04="55555555-0001-0000-0000-000000000004"
P05="55555555-0001-0000-0000-000000000005"
P06="55555555-0001-0000-0000-000000000006"
P07="55555555-0001-0000-0000-000000000007"
P08="55555555-0001-0000-0000-000000000008"
P09="55555555-0001-0000-0000-000000000009"
P10="55555555-0001-0000-0000-000000000010"
P11="55555555-0001-0000-0000-000000000011"
P12="55555555-0001-0000-0000-000000000012"
P13="55555555-0001-0000-0000-000000000013"
P14="55555555-0001-0000-0000-000000000014"
P15="55555555-0001-0000-0000-000000000015"
P16="55555555-0001-0000-0000-000000000016"
P17="55555555-0001-0000-0000-000000000017"
P18="55555555-0001-0000-0000-000000000018"
P19="55555555-0001-0000-0000-000000000019"
P20="55555555-0001-0000-0000-000000000020"
P21="55555555-0001-0000-0000-000000000021"
P22="55555555-0001-0000-0000-000000000022"
P23="55555555-0001-0000-0000-000000000023"
P24="55555555-0001-0000-0000-000000000024"
P25="55555555-0001-0000-0000-000000000025"
P26="55555555-0001-0000-0000-000000000026"
P27="55555555-0001-0000-0000-000000000027"
P28="55555555-0001-0000-0000-000000000028"
P29="55555555-0001-0000-0000-000000000029"
P30="55555555-0001-0000-0000-000000000030"
P31="55555555-0001-0000-0000-000000000031"
P32="55555555-0001-0000-0000-000000000032"
P33="55555555-0001-0000-0000-000000000033"
P34="55555555-0001-0000-0000-000000000034"
P35="55555555-0001-0000-0000-000000000035"
P36="55555555-0001-0000-0000-000000000036"
P37="55555555-0001-0000-0000-000000000037"
P38="55555555-0001-0000-0000-000000000038"
P39="55555555-0001-0000-0000-000000000039"
P40="55555555-0001-0000-0000-000000000040"
P41="55555555-0001-0000-0000-000000000041"
P42="55555555-0001-0000-0000-000000000042"

echo "=== 0/1. Corp & Brand already inserted, skipping ==="

echo ""
echo "=== 2. Insert Stores ==="
post "stores" '[
  {
    "id": "'$STORE_SHIBUYA'",
    "brand_id": "'$BRAND_ID'",
    "name": "いきなりステーキ 渋谷センター街店",
    "slug": "ikinari-shibuya",
    "display_id": "STR-IknrSby",
    "status": "open",
    "address": "東京都渋谷区宇田川町33-13 楠原ビル1F",
    "phone": "03-6455-0329",
    "genre": "ステーキ",
    "lat": 35.6614,
    "lng": 139.6983,
    "has_takeout": true,
    "has_delivery": false,
    "reservation_enabled": true,
    "seat_only_reservation": true,
    "max_reservation_capacity": 32
  },
  {
    "id": "'$STORE_KANDA'",
    "brand_id": "'$BRAND_ID'",
    "name": "いきなりステーキ 神田北口店",
    "slug": "ikinari-kanda",
    "display_id": "STR-IknrKnd",
    "status": "open",
    "address": "東京都千代田区神田須田町1-34-3 D2SMビル1F",
    "phone": "03-5209-5929",
    "genre": "ステーキ",
    "lat": 35.6960,
    "lng": 139.7710,
    "has_takeout": true,
    "has_delivery": false,
    "reservation_enabled": true,
    "seat_only_reservation": true,
    "max_reservation_capacity": 38
  },
  {
    "id": "'$STORE_SHINBASHI'",
    "brand_id": "'$BRAND_ID'",
    "name": "いきなりステーキ 新橋日比谷口店",
    "slug": "ikinari-shinbashi",
    "display_id": "STR-IknrSnb",
    "status": "open",
    "address": "東京都港区新橋2-6-5 織田興産ビル",
    "phone": "03-6550-8429",
    "genre": "ステーキ",
    "lat": 35.6660,
    "lng": 139.7580,
    "has_takeout": true,
    "has_delivery": false,
    "reservation_enabled": true,
    "seat_only_reservation": true,
    "max_reservation_capacity": 23
  },
  {
    "id": "'$STORE_IKEBUKURO'",
    "brand_id": "'$BRAND_ID'",
    "name": "いきなりステーキ 池袋東口店",
    "slug": "ikinari-ikebukuro",
    "display_id": "STR-IknrIkb",
    "status": "open",
    "address": "東京都豊島区東池袋1-15-1 菱山ビル1F",
    "phone": "03-5927-8929",
    "genre": "ステーキ",
    "lat": 35.7295,
    "lng": 139.7131,
    "has_takeout": true,
    "has_delivery": false,
    "reservation_enabled": true,
    "seat_only_reservation": true,
    "max_reservation_capacity": 22
  },
  {
    "id": "'$STORE_YAESU'",
    "brand_id": "'$BRAND_ID'",
    "name": "いきなりステーキ ヤエチカ店",
    "slug": "ikinari-yaesu",
    "display_id": "STR-IknrYes",
    "status": "open",
    "address": "東京都中央区八重洲2-1 八重洲地下街南1号",
    "phone": "03-5542-1929",
    "genre": "ステーキ",
    "lat": 35.6793,
    "lng": 139.7700,
    "has_takeout": true,
    "has_delivery": false,
    "reservation_enabled": true,
    "seat_only_reservation": true,
    "max_reservation_capacity": 24
  }
]'

echo ""
echo "=== 3. Insert Store Hours ==="
# All stores: Mon-Sun, 11:00-23:00 (Ikebukuro: 11:00-22:30)
HOURS_DATA="["
for STORE in $STORE_SHIBUYA $STORE_KANDA $STORE_SHINBASHI $STORE_YAESU; do
  for DAY in 0 1 2 3 4 5 6; do
    HOURS_DATA+="{\"store_id\":\"${STORE}\",\"day_of_week\":${DAY},\"open_time\":\"11:00:00\",\"close_time\":\"23:00:00\",\"is_closed\":false},"
  done
done
# Ikebukuro: 11:00-22:30
for DAY in 0 1 2 3 4 5 6; do
  HOURS_DATA+="{\"store_id\":\"${STORE_IKEBUKURO}\",\"day_of_week\":${DAY},\"open_time\":\"11:00:00\",\"close_time\":\"22:30:00\",\"is_closed\":false},"
done
HOURS_DATA="${HOURS_DATA%,}]"
post "store_hours" "$HOURS_DATA"

echo ""
echo "=== 4. Insert Categories ==="
post "categories" '[
  {"id":"'$CAT_LUNCH'","brand_id":"'$BRAND_ID'","name":"ランチメニュー","sort_order":1},
  {"id":"'$CAT_GRAND'","brand_id":"'$BRAND_ID'","name":"グランドメニュー","sort_order":2},
  {"id":"'$CAT_SET'","brand_id":"'$BRAND_ID'","name":"セットメニュー","sort_order":3},
  {"id":"'$CAT_TOPPING'","brand_id":"'$BRAND_ID'","name":"トッピング","sort_order":4},
  {"id":"'$CAT_DRINK'","brand_id":"'$BRAND_ID'","name":"ドリンク","sort_order":5}
]'

echo ""
echo "=== 5. Insert Products ==="
post "products" '[
  {"id":"'$P01'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチワイルドステーキ","description":"ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P02'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ 赤身！肩ロースステーキ","description":"ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P03'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ ワイルドハンバーグ","description":"オニオンソース付き。ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P04'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ ワイルドコンボ","description":"ステーキ+ハンバーグ。オニオンソース付き","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P05'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ グリルチキンステーキ","description":"ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P06'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ リブロースステーキ","description":"ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P07'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ 特選ヒレステーキ","description":"ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P08'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_LUNCH'","name":"ランチ 乱切りカットステーキ","description":"ライス・サラダ・スープ付","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P09'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"ワイルドステーキ","description":"いきなり！ステーキの看板メニュー","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P10'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"赤身！肩ロースステーキ","description":"赤身肉のジューシーな旨み","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P11'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"リブロースステーキ","description":"きめ細かなサシと濃厚な旨味","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P12'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"特選ヒレステーキ","description":"柔らかく上品な味わい","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P13'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"ヒレカットステーキ","description":"一口サイズにカットしたヒレ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P14'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"ワイルドハンバーグ","description":"オニオンソース付き","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P15'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"ワイルドコンボ","description":"ステーキ+ハンバーグ。オニオンソース付き","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P16'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"乱切りカットステーキ","description":"食べやすい乱切りカット","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P17'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"グリルチキンステーキ","description":"ジューシーに焼き上げた鶏もも肉","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P18'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"ステーキ重","description":"テイクアウトもOK","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P19'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_GRAND'","name":"ヒレステーキ重","description":"テイクアウトもOK","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P20'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"いきなりセット","description":"ライス・サラダ・ドリンクまたはスープ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P21'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"ミニカレーライスセット","description":"ミニカレーライス・サラダ・ドリンクまたはスープ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P22'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"ライス＆サラダセット","description":"ライスとサラダのシンプルセット","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P23'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"ライス＆ドリンクセット","description":"ライスとドリンク（スープ変更可）","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P24'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"ライス（おかわり無料）","description":"白飯","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P25'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"ミニカレーライス","description":"カレールー別添え","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P26'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"サラダ","description":"フレッシュサラダ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P27'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_SET'","name":"特製スープ","description":"ビーフスープ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P28'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"トッピングハンバーグ","description":"オニオンソース付き 100g","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P29'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"ブロッコリー","description":"付け合わせ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P30'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"コーン","description":"付け合わせ","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P31'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"チーズソース","description":"トッピング","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P32'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"カレールー","description":"トッピング","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P33'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"オニオンソース","description":"トッピング","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P34'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_TOPPING'","name":"和風おろしポン酢","description":"トッピング","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P35'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"生ビール（中）","description":"アルコール","tax_rate":10,"is_alcohol":true,"dine_in":true,"takeout":false,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P36'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"生ビール（小）","description":"アルコール","tax_rate":10,"is_alcohol":true,"dine_in":true,"takeout":false,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P37'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"ハイボール","description":"アルコール","tax_rate":10,"is_alcohol":true,"dine_in":true,"takeout":false,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P38'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"グラスワイン（赤/白）","description":"アルコール","tax_rate":10,"is_alcohol":true,"dine_in":true,"takeout":false,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P39'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"ボトルワイン（赤/白）","description":"アルコール","tax_rate":10,"is_alcohol":true,"dine_in":true,"takeout":false,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P40'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"コカ・コーラ","description":"ソフトドリンク","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P41'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"アイスコーヒー","description":"ソフトドリンク","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"},
  {"id":"'$P42'","brand_id":"'$BRAND_ID'","category_id":"'$CAT_DRINK'","name":"黒烏龍茶（トクホ）","description":"ソフトドリンク","tax_rate":10,"is_alcohol":false,"dine_in":true,"takeout":true,"delivery":false,"sale_status":"on_sale"}
]'

echo ""
echo "=== 6. Insert Product Sizes ==="
# Using sequential IDs for product_sizes
post "product_sizes" '[
  {"product_id":"'$P01'","name":"150g","price":1800,"sort_order":1},
  {"product_id":"'$P01'","name":"200g","price":2250,"sort_order":2},
  {"product_id":"'$P01'","name":"300g","price":2920,"sort_order":3},
  {"product_id":"'$P01'","name":"450g","price":3820,"sort_order":4},
  {"product_id":"'$P02'","name":"150g","price":1560,"sort_order":1},
  {"product_id":"'$P02'","name":"200g","price":1940,"sort_order":2},
  {"product_id":"'$P02'","name":"300g","price":2510,"sort_order":3},
  {"product_id":"'$P02'","name":"450g","price":3280,"sort_order":4},
  {"product_id":"'$P03'","name":"150g","price":1350,"sort_order":1},
  {"product_id":"'$P03'","name":"200g","price":1470,"sort_order":2},
  {"product_id":"'$P03'","name":"300g","price":1700,"sort_order":3},
  {"product_id":"'$P04'","name":"ステーキ80g+ハンバーグ100g","price":1560,"sort_order":1},
  {"product_id":"'$P04'","name":"ステーキ100g+ハンバーグ150g","price":1910,"sort_order":2},
  {"product_id":"'$P05'","name":"220g","price":1300,"sort_order":1},
  {"product_id":"'$P05'","name":"440g","price":1920,"sort_order":2},
  {"product_id":"'$P06'","name":"150g","price":2260,"sort_order":1},
  {"product_id":"'$P06'","name":"200g","price":2940,"sort_order":2},
  {"product_id":"'$P06'","name":"300g","price":4300,"sort_order":3},
  {"product_id":"'$P07'","name":"150g","price":2840,"sort_order":1},
  {"product_id":"'$P07'","name":"200g","price":3710,"sort_order":2},
  {"product_id":"'$P08'","name":"120g","price":1910,"sort_order":1},
  {"product_id":"'$P08'","name":"160g","price":2300,"sort_order":2},
  {"product_id":"'$P08'","name":"200g","price":2700,"sort_order":3},
  {"product_id":"'$P08'","name":"240g","price":3100,"sort_order":4},
  {"product_id":"'$P09'","name":"150g","price":1580,"sort_order":1},
  {"product_id":"'$P09'","name":"200g","price":2030,"sort_order":2},
  {"product_id":"'$P09'","name":"300g","price":2700,"sort_order":3},
  {"product_id":"'$P09'","name":"450g","price":3600,"sort_order":4},
  {"product_id":"'$P10'","name":"150g","price":1340,"sort_order":1},
  {"product_id":"'$P10'","name":"200g","price":1720,"sort_order":2},
  {"product_id":"'$P10'","name":"300g","price":2290,"sort_order":3},
  {"product_id":"'$P10'","name":"450g","price":3060,"sort_order":4},
  {"product_id":"'$P11'","name":"150g","price":2040,"sort_order":1},
  {"product_id":"'$P11'","name":"200g","price":2720,"sort_order":2},
  {"product_id":"'$P11'","name":"300g","price":4080,"sort_order":3},
  {"product_id":"'$P11'","name":"400g","price":5440,"sort_order":4},
  {"product_id":"'$P12'","name":"150g","price":2620,"sort_order":1},
  {"product_id":"'$P12'","name":"200g","price":3490,"sort_order":2},
  {"product_id":"'$P12'","name":"250g","price":4360,"sort_order":3},
  {"product_id":"'$P12'","name":"300g","price":5230,"sort_order":4},
  {"product_id":"'$P13'","name":"100g","price":1640,"sort_order":1},
  {"product_id":"'$P13'","name":"150g","price":2460,"sort_order":2},
  {"product_id":"'$P14'","name":"150g","price":1130,"sort_order":1},
  {"product_id":"'$P14'","name":"200g","price":1250,"sort_order":2},
  {"product_id":"'$P14'","name":"300g","price":1480,"sort_order":3},
  {"product_id":"'$P15'","name":"ステーキ100g+ハンバーグ150g","price":1690,"sort_order":1},
  {"product_id":"'$P15'","name":"ステーキ150g+ハンバーグ150g","price":2080,"sort_order":2},
  {"product_id":"'$P15'","name":"ステーキ300g+ハンバーグ150g","price":2860,"sort_order":3},
  {"product_id":"'$P16'","name":"120g","price":1690,"sort_order":1},
  {"product_id":"'$P16'","name":"160g","price":2080,"sort_order":2},
  {"product_id":"'$P16'","name":"200g","price":2480,"sort_order":3},
  {"product_id":"'$P16'","name":"240g","price":2880,"sort_order":4},
  {"product_id":"'$P17'","name":"220g","price":1080,"sort_order":1},
  {"product_id":"'$P17'","name":"440g","price":1700,"sort_order":2},
  {"product_id":"'$P18'","name":"150g","price":1610,"sort_order":1},
  {"product_id":"'$P19'","name":"100g","price":1890,"sort_order":1},
  {"product_id":"'$P20'","name":"セット","price":480,"sort_order":1},
  {"product_id":"'$P21'","name":"セット","price":700,"sort_order":1},
  {"product_id":"'$P22'","name":"セット","price":420,"sort_order":1},
  {"product_id":"'$P23'","name":"セット","price":420,"sort_order":1},
  {"product_id":"'$P24'","name":"一膳","price":310,"sort_order":1},
  {"product_id":"'$P25'","name":"一皿","price":540,"sort_order":1},
  {"product_id":"'$P26'","name":"一皿","price":240,"sort_order":1},
  {"product_id":"'$P27'","name":"一杯","price":210,"sort_order":1},
  {"product_id":"'$P28'","name":"100g","price":440,"sort_order":1},
  {"product_id":"'$P29'","name":"一皿","price":140,"sort_order":1},
  {"product_id":"'$P30'","name":"一皿","price":140,"sort_order":1},
  {"product_id":"'$P31'","name":"一皿","price":170,"sort_order":1},
  {"product_id":"'$P32'","name":"一皿","price":250,"sort_order":1},
  {"product_id":"'$P33'","name":"一皿","price":140,"sort_order":1},
  {"product_id":"'$P34'","name":"一皿","price":140,"sort_order":1},
  {"product_id":"'$P35'","name":"中","price":650,"sort_order":1},
  {"product_id":"'$P36'","name":"小","price":430,"sort_order":1},
  {"product_id":"'$P37'","name":"一杯","price":500,"sort_order":1},
  {"product_id":"'$P38'","name":"一杯","price":570,"sort_order":1},
  {"product_id":"'$P39'","name":"一本","price":2180,"sort_order":1},
  {"product_id":"'$P40'","name":"一杯","price":280,"sort_order":1},
  {"product_id":"'$P41'","name":"一杯","price":180,"sort_order":1},
  {"product_id":"'$P42'","name":"一杯","price":400,"sort_order":1}
]'

echo ""
echo "=== 7. Insert Media (Brand Hero + Store Thumbnails) ==="
post "media" '[
  {"entity_type":"brand","entity_id":"'$BRAND_ID'","media_type":"brand_hero","url":"https://images.unsplash.com/photo-1600891964092-4316c288032e?w=1200&h=600&fit=crop","title":"ブランドヒーロー","description":null,"sort_order":1,"is_video":false,"display_id":"MDA-IknrHr1"},
  {"entity_type":"brand","entity_id":"'$BRAND_ID'","media_type":"brand_recommend","url":"https://images.unsplash.com/photo-1558030006-450675393462?w=600&h=400&fit=crop","title":"ワイルドステーキ","description":"いきなり！ステーキの看板メニュー。お好みのグラム数でカット。","sort_order":1,"is_video":false,"display_id":"MDA-IknrRc1"},
  {"entity_type":"brand","entity_id":"'$BRAND_ID'","media_type":"brand_recommend","url":"https://images.unsplash.com/photo-1546964124-0cce460f38ef?w=600&h=400&fit=crop","title":"リブロースステーキ","description":"きめ細かなサシと濃厚な旨味が特徴の贅沢ステーキ。","sort_order":2,"is_video":false,"display_id":"MDA-IknrRc2"},
  {"entity_type":"store","entity_id":"'$STORE_SHIBUYA'","media_type":"store_thumbnail","url":"https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop","title":"渋谷センター街店","description":null,"sort_order":1,"is_video":false,"display_id":"MDA-IknrSt1"},
  {"entity_type":"store","entity_id":"'$STORE_KANDA'","media_type":"store_thumbnail","url":"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop","title":"神田北口店","description":null,"sort_order":1,"is_video":false,"display_id":"MDA-IknrSt2"},
  {"entity_type":"store","entity_id":"'$STORE_SHINBASHI'","media_type":"store_thumbnail","url":"https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400&h=300&fit=crop","title":"新橋日比谷口店","description":null,"sort_order":1,"is_video":false,"display_id":"MDA-IknrSt3"},
  {"entity_type":"store","entity_id":"'$STORE_IKEBUKURO'","media_type":"store_thumbnail","url":"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop","title":"池袋東口店","description":null,"sort_order":1,"is_video":false,"display_id":"MDA-IknrSt4"},
  {"entity_type":"store","entity_id":"'$STORE_YAESU'","media_type":"store_thumbnail","url":"https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=400&h=300&fit=crop","title":"ヤエチカ店","description":null,"sort_order":1,"is_video":false,"display_id":"MDA-IknrSt5"}
]'

echo ""
echo "=== 8. Insert Brand News ==="
post "brand_news" '[
  {"brand_id":"'$BRAND_ID'","title":"【期間限定】プレミアムリブロースフェア開催中！","category":"event","published_at":"2026-03-25","url":"https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=800&h=400&fit=crop","status":"published"},
  {"brand_id":"'$BRAND_ID'","title":"テイクアウトメニューがリニューアル","category":"info","published_at":"2026-03-15","url":"https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800&h=400&fit=crop","status":"published"},
  {"brand_id":"'$BRAND_ID'","title":"いきなり！ステーキ公式アプリ ポイント2倍キャンペーン","category":"news","published_at":"2026-04-01","url":"https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=400&fit=crop","status":"published"}
]'

echo ""
echo "=== All inserts completed successfully! ==="
echo "Brand ID: $BRAND_ID"
echo "Stores: 5"
echo "Categories: 5"
echo "Products: 42"
echo "Product Sizes: 78"
echo "Media: 8"
echo "Brand News: 3"
