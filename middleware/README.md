# Toyota Smart Gate — Middleware

NestJS modular monolith: LPR ingest, SAP lookup, kiosk sessions (Socket.io), gate open, shared queue engine (Redis + BullMQ), notifications stubs, and audit stream.

## Prerequisites

- Node.js 20+
- Redis 7 (`docker compose up -d`)

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run start:dev
```

Health: `GET http://localhost:3000/health`

## Key HTTP routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/lpr/plate-read` | Camera plate ingest |
| POST | `/session/start` | Manual kiosk session (test without LPR) |
| POST | `/session/:id/input` | Touch/STT input |
| GET | `/session/:id` | Session snapshot |
| POST | `/slots/freed` | Slot availability webhook |
| GET | `/queue` | Live queue entries |
| POST | `/notifications/whatsapp/confirm` | WhatsApp claim confirm |
| GET | `/audit/events` | Recent domain-event audit trail |

## Socket.io (kiosk)

- Namespace: `/kiosk`
- Client → `kiosk.join` `{ gateId }` → joins room `gate:{gateId}`
- Server → `session.update` (public session payload)
- Client → `session.input` `{ sessionId, source, choice?, text?, phone_digits? }`

## Event flow

`lpr.plate.read` → SAP found/not found → kiosk session → identity/phone confirmed → `gate.open.*` + `queue.enqueued` → `slot.freed` → notify + 50s BullMQ claim timer → WhatsApp confirm or timeout+shift.

## Voice service

TTS/STT remain on the Python `kiosk-voice` service (`/tts`, `/stt`). Kiosk UI talks to this middleware for sessions over Socket.io.

## Tests / prove

```bash
npm test
# with middleware + redis running:
bash scripts/prove_flow.sh http://127.0.0.1:3000
```
