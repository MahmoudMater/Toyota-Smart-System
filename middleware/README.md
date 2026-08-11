# Toyota Smart Gate — Middleware

NestJS modular monolith: LPR ingest, SAP lookup, kiosk sessions (Socket.io), gate open, TTS/STT (ElevenLabs), optional Beyond Presence avatar (LiveKit), shared queue engine (Redis + BullMQ), notifications stubs, audit stream, and kiosk UI serving.

## Prerequisites

- Node.js 20+
- Redis 7 (`docker compose up -d`)
- ElevenLabs API key (or use `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for demos without one)
- Optional for HD video avatar:
  - [LiveKit Cloud](https://cloud.livekit.io) → `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  - [Beyond Presence](https://bey.studio/settings/api-keys) → `BEY_API_KEY`

## Setup

```bash
cp .env.example .env
# Set ELEVENLABS_API_KEY and ELEVENLABS_TTS_VOICE_ID in .env
npm install
docker compose up -d
npm run start:dev
```

Health: `GET http://localhost:3000/health`

## Beyond Presence avatar (optional)

Default face is the local canvas/Rive lip-sync (`AVATAR_ADAPTER=canvas`). To use Beyond Presence speech-to-video:

1. Set in `.env`:
   ```bash
   AVATAR_ADAPTER=bey
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   BEY_API_KEY=...
   BEY_AVATAR_ID=694c83e2-8895-4a98-bd16-56332ca3f449   # Nelly
   LIVEKIT_AGENT_NAME=tamkeen-avatar
   ```
2. Install and run the speaker worker (separate process):
   ```bash
   npm --prefix avatar-agent install
   npm run avatar-agent:dev
   ```
3. Restart Nest so it picks up `AVATAR_ADAPTER=bey`.
4. Open the console, run a visit — Nest dispatches the agent, sends `kiosk.speak` with the prompt speech text; ElevenLabs TTS + Nelly video stream over LiveKit. Yes/No/keypad stay on Nest.

If LiveKit/BEY keys are missing, Nest stays on canvas even when `AVATAR_ADAPTER=bey`.

Check: `GET /avatar/config` → `{ "adapter": "bey", "bey_enabled": true }`

## Key HTTP routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/tts` | Text-to-speech (`{ text, lang }` → audio bytes) |
| POST | `/stt` | Speech-to-text (multipart `audio` → `{ text, normalized, digits }`) |
| GET | `/avatar/config` | Avatar adapter (`canvas` \| `bey`) |
| GET | `/avatar/token` | LiveKit join token (`session_id`, `gate_id`) when bey enabled |
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
- Server → `session.update` (public session payload; may include `livekit` join info when bey)
- Client → `session.input` `{ sessionId, source, choice?, text?, phone_digits? }`

## Event flow

`lpr.plate.read` → SAP found/not found → kiosk session → identity/phone confirmed → `gate.open.*` + `queue.enqueued` → `slot.freed` → notify + 50s BullMQ claim timer → WhatsApp confirm or timeout+shift.

## TTS/STT

Speech synthesis and transcription are served by this middleware through ElevenLabs cloud APIs (`/tts`, `/stt`). The adapter seam supports swapping to `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for offline demos or testing without an API key.

When `AVATAR_ADAPTER=bey`, prompt speech is spoken by the LiveKit agent (ElevenLabs TTS plugin) so Beyond Presence can lip-sync; the browser does not double-play `/tts` for session prompts. The agent must use a **streaming** ElevenLabs model (`ELEVENLABS_AVATAR_TTS_MODEL_ID`, default `eleven_flash_v2_5`) — `eleven_v3` works for Nest's HTTP `/tts` but WebSocket `multi-stream-input` returns **403**.

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
