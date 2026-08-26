# Toyota Smart Gate & Queue — Tamkeen Phase 1

**Tamkeen solution proposal for Toyota (Al-Sayer Hayyak):** a smart gate and shared garage-slot queue for a single branch. One NestJS middleware orchestrates LPR plate reads, SAP customer lookup, **dual Module 1 entry** (voice avatar **or** QR check-in), gate commands, and fair slot notifications with a 50-second WhatsApp claim window.

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
| 01 | [System context](docs/client/diagrams/01-system-context.png) | Actors, middleware, LPR, SAP, gate, WhatsApp, ElevenLabs, phone check-in |
| 02 | [Containers](docs/client/diagrams/02-containers.png) | Next UIs, NestJS, Redis, Socket.io, CheckinModule |
| 03 | [End-to-end flow (Approach A)](docs/client/diagrams/03-end-to-end-flow.png) | Voice visit + queue claim |
| 04 | [Kiosk conversation](docs/client/diagrams/04-kiosk-conversation.png) | Approach A state machine |
| 05 | [Known customer sequence](docs/client/diagrams/05-known-customer-sequence.png) | Approach A happy path |
| 06 | [Driver not owner sequence](docs/client/diagrams/06-driver-not-owner-sequence.png) | Approach A visit phone |
| 07 | [Voice + avatar pipeline](docs/client/diagrams/07-voice-avatar-pipeline.png) | STT → NLU → TTS → lip-sync |
| 08 | [Socket.io HTML ↔ backend](docs/client/diagrams/08-socket-html-backend.png) | `session.update` + `checkin.display` |
| 09 | [Queue claim flow](docs/client/diagrams/09-queue-claim-flow.png) | 50s timer, WhatsApp confirm, shift-back |
| 10 | [Adapter seams](docs/client/diagrams/10-adapter-seams.png) | Ports vs stubs until vendor APIs arrive |
| 11 | [Dual entry approaches](docs/client/diagrams/11-dual-entry-approaches.png) | Approach A voice vs Approach B QR |
| 12 | [QR check-in sequence](docs/client/diagrams/12-qr-checkin-sequence.png) | Generic / LPR miss / SAP hit → form → gate |
| 13 | [Check-in ticket lifecycle](docs/client/diagrams/13-checkin-ticket-lifecycle.png) | Opaque token TTL / single use |
| 14 | [Check-in API + display](docs/client/diagrams/14-checkin-api-display.png) | HTTP + socket display |

Mermaid sources (editable): [docs/client/diagrams/*.mmd](docs/client/diagrams/)

---

## What this repo contains

| Path | Purpose |
|------|---------|
| [middleware/](middleware/) | **Main product** — NestJS modular monolith, Redis, BullMQ, Socket.io |
| [web/](web/) | Next.js UIs — QR kiosk, Voice Console, QR Console, check-in form, logs |
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

1. **Module 1 — Gate entry (dual approach)**
   - **Approach A — Voice / avatar:** After LPR + SAP, the avatar confirms identity and visit phone; gate opens and the visit is enqueued.
   - **Approach B — QR check-in:** Kiosk shows QR (generic or opaque token); phone form submits plate/name/phone; enqueue + rate-limited gate open.
2. **Module 2 — Queue Management** — One shared FIFO queue across all gates; when a slot frees, the next driver is notified with a **50s WhatsApp claim window** and **growing push-back** on no-shows.

![Dual entry](docs/client/diagrams/11-dual-entry-approaches.png)

## Quick start

**Prerequisites:** Node.js 20+, Docker (Redis 7), ElevenLabs API key for live voice (or stub adapters).

```bash
cd middleware
cp .env.example .env
# Optional: CHECKIN_PUBLIC_BASE_URL for phone-reachable QR links
npm install
docker compose up -d
npm run start:dev

# other terminal
cd web
npm install
npm run dev
```

Health check: `GET http://localhost:3000/health`

## Web UIs (Next.js on `:3001`)

| UI | URL | Purpose |
|----|-----|---------|
| **QR kiosk** | http://127.0.0.1:3001/ | Large QR + Welcome name (Approach B glass) |
| **Voice Console** | http://127.0.0.1:3001/console | Approach A: LPR → avatar TTS/STT → queue |
| **QR Console** | http://127.0.0.1:3001/console/qr | Approach B: LPR → QR → open form → queue |
| **Check-in form** | http://127.0.0.1:3001/checkin?gate=gate-1 | Mobile submit |
| **Integration logs** | http://127.0.0.1:3001/logs | Live tail of ElevenLabs, SAP, LPR, gate, … |

### Approach A walkthrough (Voice Console)

1. Open `/console` → Connect → Save SAP profile → Send LPR plate
2. Avatar greets → **Yes** or hold-to-speak
3. Free a slot → WhatsApp confirm → watch audit timeline

### Approach B walkthrough (QR Console)

1. Open `/console/qr` → Connect → Save SAP → Send LPR plate
2. QR appears → **Open check-in form** → Join queue
3. Free a slot → WhatsApp confirm (Module 2 same as A)

## End-to-end flow

**Approach A (voice):**

![End-to-end flow](docs/client/diagrams/03-end-to-end-flow.png)

**Approach B (QR):**

![QR check-in sequence](docs/client/diagrams/12-qr-checkin-sequence.png)

## Stack

- **Backend:** NestJS (TypeScript), Redis, BullMQ, Socket.io
- **Check-in:** Opaque Redis tickets (TTL 180s), public form APIs, 30s gate-open rate limit
- **Voice:** ElevenLabs STT (`scribe_v2`) + TTS (`eleven_v3`) with Redis cache; stub adapters for offline
- **NLU:** Rules-first yes/no and phone extraction; optional local LLM (Ollama)
- **Integrations:** Adapter pattern — SAP, Gate, WhatsApp are **stubs today**
- **UI:** Next.js on `:3001`; middleware API on `:3000`

## Tests

```bash
cd middleware
npm test
# With middleware + Redis running:
npm run prove
```
