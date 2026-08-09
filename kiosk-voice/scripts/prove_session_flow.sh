#!/usr/bin/env bash
# Text-only proof of English-only session flows.
set -euo pipefail
BASE="${1:-http://127.0.0.1:8080}"

json_field() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"
}

echo "=== Health ==="
curl -sS "$BASE/health"
echo

echo "=== Flow A: confirm phone on file → done ==="
START=$(curl -sS -X POST "$BASE/session/start" -H 'Content-Type: application/json' -d '{"gate_id":"gate-1"}')
echo "$START" | python3 -m json.tool
SID=$(echo "$START" | json_field "['session_id']")
test "$(echo "$START" | json_field "['state']")" = "awaiting_identity_confirm"
test "$(echo "$START" | json_field "['lang']")" = "en"

DONE=$(curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","choice":"yes"}')
echo "$DONE" | python3 -m json.tool
test "$(echo "$DONE" | json_field "['state']")" = "done"
test "$(echo "$DONE" | json_field "['gate_open_stub']")" = "True"

echo "=== Flow B: wrong number → owner yes → phone → confirm → done ==="
START=$(curl -sS -X POST "$BASE/session/start" -H 'Content-Type: application/json' -d '{"gate_id":"gate-2"}')
SID=$(echo "$START" | json_field "['session_id']")
test "$(echo "$START" | json_field "['gate_id']")" = "gate-2"

R1=$(curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","choice":"no"}')
test "$(echo "$R1" | json_field "['state']")" = "awaiting_owner_check"

R2=$(curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","choice":"yes"}')
test "$(echo "$R2" | json_field "['state']")" = "awaiting_phone_speech"

R3=$(curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","phone_digits":"0509998877"}')
test "$(echo "$R3" | json_field "['state']")" = "awaiting_phone_confirm"
test "$(echo "$R3" | json_field "['pending_phone']")" = "0509998877"

R4=$(curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","choice":"yes"}')
echo "$R4" | python3 -m json.tool
test "$(echo "$R4" | json_field "['state']")" = "done"
test "$(echo "$R4" | json_field "['visit_phone']")" = "0509998877"
test "$(echo "$R4" | json_field "['gate_open_stub']")" = "True"

echo "=== Flow C: not owner → staff_escalation ==="
START=$(curl -sS -X POST "$BASE/session/start" -H 'Content-Type: application/json' -d '{"gate_id":"gate-1"}')
SID=$(echo "$START" | json_field "['session_id']")
curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","choice":"no"}' >/dev/null
ESC=$(curl -sS -X POST "$BASE/session/$SID/input" -H 'Content-Type: application/json' \
  -d '{"source":"touch","choice":"no"}')
echo "$ESC" | python3 -m json.tool
test "$(echo "$ESC" | json_field "['state']")" = "staff_escalation"

echo "=== ALL SESSION FLOWS PASSED ==="
