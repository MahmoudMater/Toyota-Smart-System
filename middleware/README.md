# Toyota Smart Gate — Middleware

NestJS modular monolith: LPR ingest, SAP lookup, kiosk sessions (Socket.io), gate open, TTS/STT (ElevenLabs), shared queue engine (Redis + BullMQ), notifications stubs, audit stream, and kiosk UI serving.

## Prerequisites

- Node.js 20+
- Redis 7 (`docker compose up -d`)
- ElevenLabs API key (or use `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for demos without one)

## Setup

```bash
cp .env.example .env
# Set ELEVENLABS_API_KEY and ELEVENLABS_TTS_VOICE_ID in .env
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
| POST | `/session/start` | Manual kiosk session (test without LPR) |
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
| POST | `/demo/reset` | Clear queue/session/LPR/TTS cache/demo/audit keys |

## Demo console

With this middleware running on `:3000`:

1. Open http://127.0.0.1:3000/console.html
2. Connect → Save SAP profile → Send LPR plate → avatar greets → Yes → Free a slot → WhatsApp confirm
3. Watch the event timeline for the full story

## Socket.io (kiosk)

- Namespace: `/kiosk`
- Client → `kiosk.join` `{ gateId }` → joins room `gate:{gateId}`
- Server → `session.update` (public session payload)
- Client → `session.input` `{ sessionId, source, choice?, text?, phone_digits? }`

## Event flow

`lpr.plate.read` → SAP found/not found → kiosk session → identity/phone confirmed → `gate.open.*` + `queue.enqueued` → `slot.freed` → notify + 50s BullMQ claim timer → WhatsApp confirm or timeout+shift.

## TTS/STT

Speech synthesis and transcription are served by this middleware through ElevenLabs cloud APIs (`/tts`, `/stt`). The adapter seam supports swapping to `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for offline demos or testing without an API key.

**Important**: This means the gate kiosk requires outbound internet to ElevenLabs when using the `elevenlabs` adapter. If the link drops, the kiosk cannot speak or listen. The touch keypad path in the state machine still works as a degraded fallback.

TTS responses are cached in Redis (`tts:cache:{hash}`, configurable TTL via `TTS_CACHE_TTL_SECONDS`) so repeated prompts don't incur additional API calls.

## Kiosk UI

The kiosk browser UI is served as static files from `public/` via `@nestjs/serve-static`. Both the main kiosk page (`index.html`) and the demo console (`console.html`) are accessible at `http://127.0.0.1:3000/`.

## Tests / prove

```bash
npm test
# with middleware + redis running:
bash scripts/prove_flow.sh http://127.0.0.1:3000
```
