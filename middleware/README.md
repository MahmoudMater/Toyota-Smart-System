# Toyota Smart Gate — Middleware

NestJS modular monolith: LPR ingest, SAP lookup, **dual Module 1 entry** (voice kiosk sessions + QR check-in), gate open, TTS/STT (ElevenLabs), shared queue engine (Redis + BullMQ), notifications stubs, audit stream.

## Prerequisites

- Node.js 20+
- Redis 7 (`docker compose up -d`)
- ElevenLabs API key (or use `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for demos without one)
- Next.js web app in [`../web`](../web) for UIs (port 3001)

## Setup

```bash
cp .env.example .env
# Set ELEVENLABS_API_KEY and ELEVENLABS_TTS_VOICE_ID for live voice
# Set CHECKIN_PUBLIC_BASE_URL to a phone-reachable URL for real-lane QR demos
npm install
docker compose up -d
npm run start:dev
```

Health: `GET http://localhost:3000/health`

## Key HTTP routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/tts` | Text-to-speech (`{ text, lang }` → audio bytes) |
| POST | `/stt` | Speech-to-text (multipart `audio` → `{ text, normalized, digits }`) |
| POST | `/lpr/plate-read` | Camera plate ingest |
| GET | `/checkin/display/:gateId` | Current QR kiosk display |
| GET | `/checkin/tickets/:token` | Prefill payload (410 if expired) |
| POST | `/checkin/submit` | Enqueue visit; 409 if plate already queued |
| POST | `/session/start` | Manual dual start (voice session + ticket) |
| POST | `/session/:id/input` | Touch/STT input |
| GET | `/session/:id` | Session snapshot |
| POST | `/slots/freed` | Single slot free → notify next |
| GET | `/slots/available` | Available free slots + active claims |
| PUT | `/slots/available` | Set available free slot count `{ available }` |
| POST | `/slots/freed-batch` | Free N slots → notify up to N waiting (`{ count? }`) |
| GET | `/queue` | Live queue entries |
| POST | `/notifications/whatsapp/confirm` | WhatsApp claim confirm |
| GET | `/audit/events` | Recent domain-event audit trail |
| GET | `/demo/config` | Demo config (`claimTimeoutMs`) |
| POST | `/demo/sap-profile` | Register fake-SAP override for a plate |
| POST | `/demo/reset` | Clear queue/session/LPR/check-in/TTS/demo/audit keys |

## Demo UIs (Next.js)

With this middleware on `:3000` and `cd ../web && npm run dev` on `:3001`:

| UI | URL |
|----|-----|
| QR kiosk | http://127.0.0.1:3001/ |
| Voice Console (Approach A) | http://127.0.0.1:3001/console |
| QR Console (Approach B) | http://127.0.0.1:3001/console/qr |
| Check-in form | http://127.0.0.1:3001/checkin?gate=gate-1 |
| Logs | http://127.0.0.1:3001/logs |

**Approach A:** Connect → Save SAP → Send LPR → avatar Yes → Free slot → WhatsApp confirm.  
**Approach B:** Connect → Save SAP → Send LPR → Open check-in form → Submit → Free slot → WhatsApp confirm.

## Socket.io (kiosk)

- Namespace: `/kiosk`
- Client → `kiosk.join` `{ gateId }` → joins room `gate:{gateId}` (also pushes current `checkin.display`)
- Server → `checkin.display` (Approach B QR payload)
- Server → `session.update` (Approach A public session)
- Client → `session.input` `{ sessionId, source, choice?, text?, phone_digits? }`

## Event flow

`lpr.plate.read` → SAP found/not found → **mint check-in ticket + voice session** →  
- Approach A: identity/phone confirmed → `gate.open.*` + `queue.enqueued`  
- Approach B: `POST /checkin/submit` → `queue.enqueued` + rate-limited gate open → `checkin.submitted`  

Then shared: `slot.freed` → notify + 50s BullMQ claim timer → WhatsApp confirm or timeout+shift.

## TTS/STT

Speech synthesis and transcription are served through ElevenLabs (`/tts`, `/stt`) for Approach A. Stub adapters support offline demos. Touch keypad remains a degraded fallback.

TTS responses are cached in Redis (`tts:cache:{hash}`, configurable TTL via `TTS_CACHE_TTL_SECONDS`).

## Tests / prove

```bash
npm test
# with middleware + redis running (QR check-in path):
npm run prove
# or: bash scripts/prove_flow.sh http://127.0.0.1:3000
```
