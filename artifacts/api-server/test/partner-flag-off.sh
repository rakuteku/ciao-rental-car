#!/usr/bin/env bash
set -euo pipefail

# Run against a development API started with RENTAL_MARKETPLACE_ENABLED unset.
# Example: TEST_API_BASE_URL=http://localhost:8080/api bash test/partner-flag-off.sh
: "${TEST_API_BASE_URL:?Set TEST_API_BASE_URL to a development API running with the marketplace flag off}"
: "${DATABASE_URL:?A development database is required}"
marker="flag-off-check-${RANDOM}-${RANDOM}"
operator_id=""
vehicle_id=""
cleanup() {
  if [[ -n "$vehicle_id" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "DELETE FROM rental_vehicles WHERE id = $vehicle_id" >/dev/null
  fi
  if [[ -n "$operator_id" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "DELETE FROM rental_operators WHERE id = $operator_id" >/dev/null
  fi
}
trap cleanup EXIT

operator_id=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "INSERT INTO rental_operators (slug, name, status, verification_status)
   VALUES ('$marker', 'Temporary partner', 'active', 'approved') RETURNING id")
vehicle_id=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt -c \
  "INSERT INTO rental_vehicles (operator_id, slug, internal_name, public_title, brand, model, year, status, moderation_status)
   VALUES ($operator_id, '$marker', 'Temporary partner vehicle', 'Temporary partner vehicle',
   'Toyota', 'Test', 2025, 'published', 'approved') RETURNING id")

detail_status=$(curl -s -o /dev/null -w '%{http_code}' "$TEST_API_BASE_URL/rental/vehicles/$marker")
[[ "$detail_status" == "404" ]] || { echo "Published partner detail visible with flag off: $detail_status"; exit 1; }

list=$(curl -fsS "$TEST_API_BASE_URL/rental/vehicles")
[[ "$list" != *"$marker"* ]] || { echo "Published partner visible in public list"; exit 1; }
search=$(curl -fsSG "$TEST_API_BASE_URL/rental/vehicles/search" --data-urlencode "slug=$marker")
[[ "$search" != *"$marker"* ]] || { echo "Published partner visible in public search"; exit 1; }

request="{\"vehicleId\":$vehicle_id,\"pickupAt\":\"2027-01-05T09:00:00Z\",\"returnAt\":\"2027-01-06T09:00:00Z\"}"
hold_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$TEST_API_BASE_URL/rental/reservations/hold" -H 'Content-Type: application/json' -d "$request")
[[ "$hold_status" == "404" ]] || { echo "Published partner could be held with flag off: $hold_status"; exit 1; }
price_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$TEST_API_BASE_URL/rental/pricing/calculate" -H 'Content-Type: application/json' -d "$request")
[[ "$price_status" == "404" ]] || { echo "Published partner could be priced with flag off: $price_status"; exit 1; }

platform_status=$(curl -s -o /dev/null -w '%{http_code}' "$TEST_API_BASE_URL/rental/vehicles/toyota-alphard")
[[ "$platform_status" == "200" ]] || { echo "Existing platform fleet unavailable: $platform_status"; exit 1; }
echo "Flag-off regression passed: partner listing, hold and price hidden; existing platform URL retained."