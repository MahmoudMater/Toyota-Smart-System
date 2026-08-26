#!/usr/bin/env bash
# Prove: plate-read → check-in submit → enqueue → slot freed → notify → WhatsApp confirm
set -euo pipefail

BASE="${1:-http://127.0.0.1:3000}"
GATE="${GATE_ID:-gate-1}"
PLATE="${PLATE:-ABC 1234}"
NAME="${NAME:-Ahmed Hassan}"
PHONE="${PHONE:-0501234567}"

echo "== health =="
curl -sf "$BASE/health" | tee /tmp/mw-health.json
echo

echo "== reset demo (clean slate) =="
curl -sf -X POST "$BASE/demo/reset" -H 'Content-Type: application/json' -d '{}' | tee /tmp/mw-reset.json
echo

echo "== seed SAP profile =="
curl -sf -X POST "$BASE/demo/sap-profile" \
  -H 'Content-Type: application/json' \
  -d "{\"plateNumber\":\"$PLATE\",\"name\":\"$NAME\",\"phone\":\"$PHONE\"}" | tee /tmp/mw-sap.json
echo

echo "== LPR plate-read =="
curl -sf -X POST "$BASE/lpr/plate-read" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: prove-flow-1' \
  -d "{\"gateId\":\"$GATE\",\"plateNumber\":\"$PLATE\"}" | tee /tmp/mw-lpr.json
echo
sleep 0.5

echo "== check-in display (token QR) =="
DISPLAY_JSON=$(curl -sf "$BASE/checkin/display/$GATE")
echo "$DISPLAY_JSON" | tee /tmp/mw-display.json
TOKEN=$(echo "$DISPLAY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token') or '')")
if [[ -z "$TOKEN" ]]; then
  echo "FAIL: no check-in token after LPR+SAP"
  exit 1
fi
echo "token=$TOKEN"

echo "== GET ticket =="
curl -sf "$BASE/checkin/tickets/$TOKEN?gateId=$GATE" | tee /tmp/mw-ticket.json
echo

echo "== POST check-in submit =="
curl -sf -X POST "$BASE/checkin/submit" \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: prove-flow-1' \
  -d "{\"token\":\"$TOKEN\",\"gateId\":\"$GATE\",\"plateNumber\":\"$PLATE\",\"name\":\"$NAME\",\"phone\":\"$PHONE\"}" \
  | tee /tmp/mw-checkin.json
echo
sleep 0.5

echo "== queue after enqueue =="
QUEUE_JSON=$(curl -sf "$BASE/queue")
echo "$QUEUE_JSON" | tee /tmp/mw-queue.json
ENTRY_ID=$(echo "$QUEUE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
PHONE_Q=$(echo "$QUEUE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['phone'] if d else '')")
if [[ -z "$ENTRY_ID" ]]; then
  echo "FAIL: queue empty after check-in submit"
  exit 1
fi
echo "entry_id=$ENTRY_ID phone=$PHONE_Q"

echo "== duplicate submit should 409 =="
HTTP=$(curl -s -o /tmp/mw-dup.json -w "%{http_code}" -X POST "$BASE/checkin/submit" \
  -H 'Content-Type: application/json' \
  -d "{\"gateId\":\"$GATE\",\"plateNumber\":\"$PLATE\",\"name\":\"$NAME\",\"phone\":\"$PHONE\"}")
echo "duplicate_status=$HTTP"
cat /tmp/mw-dup.json; echo
if [[ "$HTTP" != "409" ]]; then
  echo "FAIL: expected 409 already_queued, got $HTTP"
  exit 1
fi

echo "== slot freed =="
curl -sf -X POST "$BASE/slots/freed" \
  -H 'Content-Type: application/json' \
  -d '{"slotId":"slot-1"}' | tee /tmp/mw-slot.json
echo
sleep 0.5

echo "== queue after notify (expect status=notified) =="
QUEUE_NOTIFIED=$(curl -sf "$BASE/queue")
echo "$QUEUE_NOTIFIED" | tee /tmp/mw-queue-notified.json
STATUS=$(echo "$QUEUE_NOTIFIED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((e.get('status','') for e in d if e.get('id')=='$ENTRY_ID'), ''))")
if [[ "$STATUS" != "notified" ]]; then
  echo "FAIL: expected entry $ENTRY_ID status=notified, got '$STATUS' (BullMQ claim timer may have failed)"
  exit 1
fi
echo "status=$STATUS"

echo "== WhatsApp confirm =="
curl -sf -X POST "$BASE/notifications/whatsapp/confirm" \
  -H 'Content-Type: application/json' \
  -d "{\"entryId\":\"$ENTRY_ID\",\"slotId\":\"slot-1\",\"plateNumber\":\"$PLATE\"}" | tee /tmp/mw-wa.json
echo
sleep 0.5

echo "== queue after assign (expect empty) =="
QUEUE_AFTER=$(curl -sf "$BASE/queue")
echo "$QUEUE_AFTER" | tee /tmp/mw-queue-after.json
REMAINING=$(echo "$QUEUE_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([e for e in d if e.get('id')=='$ENTRY_ID']))")
if [[ "$REMAINING" != "0" ]]; then
  echo "FAIL: entry $ENTRY_ID still in queue after WhatsApp confirm"
  exit 1
fi
echo

echo "== audit recent =="
curl -sf "$BASE/audit/events?limit=20" | tee /tmp/mw-audit.json
echo

echo "OK prove_flow against $BASE"
