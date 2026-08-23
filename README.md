# Toyota Smart Gate & Queue — Tamkeen Phase 1

**Tamkeen solution proposal for Toyota (Al-Sayer Hayyak):** a voice-driven smart gate and shared garage-slot queue for a single branch. One NestJS middleware orchestrates LPR plate reads, SAP customer lookup, kiosk avatar sessions, gate commands, and fair slot notifications with a 50-second WhatsApp claim window.

## Quick access — project docs

| Document | Link |
|----------|------|
| **Client technical handover (Word)** | [docs/client/Toyota-Smart-Gate-Technical-Handover.docx](docs/client/Toyota-Smart-Gate-Technical-Handover.docx) |
| **Client technical handover (Markdown)** | [docs/client/Toyota-Smart-Gate-Technical-Handover.md](docs/client/Toyota-Smart-Gate-Technical-Handover.md) |
| **Solution design** | [toyota-gate-queue-system-design.md](toyota-gate-queue-system-design.md) |
| **CEO/CTO presentation** | [presentation/index.html](presentation/index.html) · [presentation/README.md](presentation/README.md) |
| **Middleware developer API** | [middleware/README.md](middleware/README.md) |
| **NLU sizing notes** | [middleware/docs/nlu-sizing.md](middleware/docs/nlu-sizing.md) |
| **Development changelog** | [releases.md](releases.md) |
| **All architecture diagrams** | [docs/client/diagrams/](docs/client/diagrams/) |

### Architecture diagrams (PNG)

| # | Diagram | Preview |
|---|---------|---------|
| 01 | [System context](docs/client/diagrams/01-system-context.png) | Actors, middleware, LPR, SAP, gate, WhatsApp, ElevenLabs |
| 02 | [Containers](docs/client/diagrams/02-containers.png) | Kiosk / console / logs UIs, NestJS, Redis, Socket.io |
| 03 | [End-to-end flow](docs/client/diagrams/03-end-to-end-flow.png) | Visit + queue claim (business rules) |
| 04 | [Kiosk conversation](docs/client/diagrams/04-kiosk-conversation.png) | State machine states and retries |
| 05 | [Known customer sequence](docs/client/diagrams/05-known-customer-sequence.png) | Happy path LPR → confirm → gate + enqueue |
| 06 | [Driver not owner sequence](docs/client/diagrams/06-driver-not-owner-sequence.png) | Visit phone capture (SAP unchanged) |
| 07 | [Voice + avatar pipeline](docs/client/diagrams/07-voice-avatar-pipeline.png) | STT → NLU → TTS → lip-sync |
| 08 | [Socket.io HTML ↔ backend](docs/client/diagrams/08-socket-html-backend.png) | `/kiosk` and `/logs` namespaces |
| 09 | [Queue claim flow](docs/client/diagrams/09-queue-claim-flow.png) | 50s timer, WhatsApp confirm, shift-back |
| 10 | [Adapter seams](docs/client/diagrams/10-adapter-seams.png) | Ports vs stubs until vendor APIs arrive |

Mermaid sources (editable): [docs/client/diagrams/*.mmd](docs/client/diagrams/)

---

## What this repo contains

| Path | Purpose |
|------|---------|
| [middleware/](middleware/) | **Main product** — NestJS modular monolith, Redis, BullMQ, Socket.io, kiosk UIs |
| [presentation/](presentation/) | CEO/CTO slide deck (reveal.js) |
| [toyota-gate-queue-system-design.md](toyota-gate-queue-system-design.md) | Authoritative solution design |
| [docs/client/Toyota-Smart-Gate-Technical-Handover.md](docs/client/Toyota-Smart-Gate-Technical-Handover.md) | **Client technical handover** (full detail) |
| [docs/client/Toyota-Smart-Gate-Technical-Handover.docx](docs/client/Toyota-Smart-Gate-Technical-Handover.docx) | Same document as Word for delivery |
| [docs/client/diagrams/](docs/client/diagrams/) | Mermaid sources (`.mmd`) and exported PNGs |
| [releases.md](releases.md) | Development changelog |

## System context

![System context diagram](docs/client/diagrams/01-system-context.png)

*[Open full size →](docs/client/diagrams/01-system-context.png)* · *[Mermaid source →](docs/client/diagrams/01-system-context.mmd)*

Two owned modules, one middleware brain:

1. **Kiosk AI Agent** — After LPR + SAP lookup, the avatar confirms identity and visit phone; gate opens and the visit is enqueued.
2. **Queue Management** — One shared FIFO queue across all gates; when a slot frees, the next driver is notified with a **50s WhatsApp claim window** and **growing push-back** on no-shows.

## Quick start

**Prerequisites:** Node.js 20+, Docker (Redis 7), ElevenLabs API key (or use stub adapters for offline demo).

```bash
cd middleware
cp .env.example .env
# Set ELEVENLABS_API_KEY and ELEVENLABS_TTS_VOICE_ID when using live voice
npm install
docker compose up -d
npm run start:dev
```

Health check: `GET http://localhost:3000/health`

## Web UIs (served from middleware on `:3000`)

| UI | URL | Purpose |
|----|-----|---------|
| **Kiosk** | http://127.0.0.1:3000/ | Voice avatar, touch input, STT/TTS sandbox |
| **Demo console** | http://127.0.0.1:3000/console.html | End-to-end demo: LPR → SAP → visit → queue → WhatsApp confirm |
| **Integration logs** | http://127.0.0.1:3000/logs.html | Live tail of ElevenLabs, SAP, LPR, gate, notification calls |

### Demo console walkthrough

1. Open **console.html** → Connect → Save SAP profile → Send LPR plate
2. Avatar greets the driver → confirm **Yes** on phone
3. **Free a slot** → simulate **WhatsApp confirm**
4. Watch the audit timeline for the full domain-event story

## End-to-end flow

![End-to-end flow](docs/client/diagrams/03-end-to-end-flow.png)

*[Open full size →](docs/client/diagrams/03-end-to-end-flow.png)* · *[Mermaid source →](docs/client/diagrams/03-end-to-end-flow.mmd)*

## Stack

- **Backend:** NestJS (TypeScript), Redis, BullMQ, Socket.io
- **Voice:** ElevenLabs STT (`scribe_v2`) + TTS (`eleven_v3`) with Redis cache; stub adapters for offline
- **NLU:** Rules-first yes/no and phone extraction; optional local LLM (Ollama) for messy digit speech
- **Integrations:** Adapter pattern — SAP, Gate, WhatsApp are **stubs today** so development continues until vendor API schemas arrive
- **UI:** Thin HTML/JS clients; all session logic on the server; avatar lip-sync via Web Audio RMS

## Tests

```bash
cd middleware
npm test
# With middleware + Redis running:
bash scripts/prove_flow.sh http://127.0.0.1:3000
```
