#!/usr/bin/env bash
# End-to-end smoke test: ./scripts/smoke_test.sh [base_url]   (default http://localhost:8080)
# Needs DATABASE_URL (from .env) only to promote the demo admin, since no API creates the first admin.
set -uo pipefail
BASE=${1:-http://localhost:8080}
cd "$(dirname "$0")/.." && set -a && . ./.env && set +a
ADMIN_EMAIL=${ADMIN_EMAIL:-demo-admin@example.com}; PASS=${DEMO_PASSWORD:-demo1234}
fails=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; else echo "  FAIL  $1 (expected $3, got $2)"; fails=$((fails+1)); fi; }
req() { curl -s -o /tmp/smoke_body -w '%{http_code}' -H 'Content-Type: application/json' "$@"; }
login() { req -X POST "$BASE/api/auth/login" -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" >/dev/null; jq -r .token /tmp/smoke_body; }
signup() { req -X POST "$BASE/api/auth/register" -d "{\"email\":\"$1\",\"password\":\"$PASS\",\"full_name\":\"$2\"}" >/dev/null; }

echo "Target: $BASE"
check "health" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")" 200

signup "$ADMIN_EMAIL" "Demo Admin"
psql "$DATABASE_URL" -qtAc "UPDATE users SET role='admin' WHERE email='$ADMIN_EMAIL'" >/dev/null
ADMIN=$(login "$ADMIN_EMAIL")   # re-login so the JWT carries the admin role
check "admin login" "$([ "$ADMIN" != null ] && echo ok)" ok
AUTH=(-H "Authorization: Bearer $ADMIN")

check "create venue" "$(req "${AUTH[@]}" -X POST "$BASE/api/venues" -d '{"name":"Smoke Arena","address":"1 Test St","capacity":100}')" 201
VENUE=$(jq -r .id /tmp/smoke_body)
check "create event" "$(req "${AUTH[@]}" -X POST "$BASE/api/events" -d "{\"venue_id\":\"$VENUE\",\"title\":\"Smoke Test Concert\",\"event_date\":\"2027-06-01T19:00:00Z\",\"ticket_price\":49.99,\"total_seats\":20}")" 201
EVENT=$(jq -r .id /tmp/smoke_body)
check "list events (public)" "$(req "$BASE/api/events")" 200
check "event seats (public)" "$(req "$BASE/api/events/$EVENT/seats")" 200
SEAT=$(jq -r '(.seats // .)[0].seat_number' /tmp/smoke_body)

U1="user1-$RANDOM@example.com"; U2="user2-$RANDOM@example.com"
signup "$U1" "User One"; T1=$(login "$U1"); signup "$U2" "User Two"; T2=$(login "$U2")

# 10 users race for the same seat: exactly one must win
for i in $(seq 1 10); do signup "race$i-$EVENT@example.com" "Racer $i"; done
for i in $(seq 1 10); do
  T=$(login "race$i-$EVENT@example.com")
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
    -X POST "$BASE/api/bookings/reserve" -d "{\"event_id\":\"$EVENT\",\"seat_number\":\"$SEAT\"}" &
done > /tmp/smoke_race; wait
check "concurrent reserve: exactly 1 winner of 10" "$(grep -cE '^20[01]$' /tmp/smoke_race)" 1

SEAT2=$(req "$BASE/api/events/$EVENT/seats" >/dev/null; jq -r '[(.seats // .)[] | select(.status=="available")][0].seat_number' /tmp/smoke_body)
code=$(req -H "Authorization: Bearer $T1" -X POST "$BASE/api/bookings/reserve" -d "{\"event_id\":\"$EVENT\",\"seat_number\":\"$SEAT2\"}")
check "user1 reserves $SEAT2" "$([[ $code == 20[01] ]] && echo ok)" ok
BOOKING=$(jq -r '.id // .booking.id // .booking_id' /tmp/smoke_body)
code=$(req -H "Authorization: Bearer $T2" -X POST "$BASE/api/bookings/reserve" -d "{\"event_id\":\"$EVENT\",\"seat_number\":\"$SEAT2\"}")
check "user2 blocked from same seat" "$([[ $code == 4* ]] && echo ok)" ok

KEY="smoke-$RANDOM-$RANDOM"
check "purchase" "$(req -H "Authorization: Bearer $T1" -H "Idempotency-Key: $KEY" -X POST "$BASE/api/bookings/purchase" -d "{\"booking_id\":\"$BOOKING\"}")" 200
first=$(cat /tmp/smoke_body)
check "retried purchase (same key) replays" "$(req -H "Authorization: Bearer $T1" -H "Idempotency-Key: $KEY" -X POST "$BASE/api/bookings/purchase" -d "{\"booking_id\":\"$BOOKING\"}")" 200
check "replay returns identical response" "$([ "$first" = "$(cat /tmp/smoke_body)" ] && echo same)" same
check "my-bookings" "$(req -H "Authorization: Bearer $T1" "$BASE/api/bookings/my-bookings")" 200
check "booking is purchased" "$(jq -r '[.[] | select(.id=="'"$BOOKING"'")][0].status' /tmp/smoke_body)" purchased
check "non-admin cannot create venue" "$(req -H "Authorization: Bearer $T1" -X POST "$BASE/api/venues" -d '{"name":"x","address":"x","capacity":1}')" 403

echo; [ $fails -eq 0 ] && echo "ALL PASSED" || echo "$fails FAILED"; exit $fails
