# Toyota Smart Gate & Queue — Technical Handover

**Document type:** Client technical handover  
**Project:** Tamkeen Phase 1 — Kiosk AI Agent & Queue Management  
**Audience:** Client technical team (CTO office, integration engineers)  
**Date:** August 2026  
**Prepared by:** Tamkeen development team

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What we are building](#2-what-we-are-building)
3. [What has been delivered](#3-what-has-been-delivered)
4. [Architecture overview](#4-architecture-overview)
5. [Design patterns — adapter ports](#5-design-patterns--adapter-ports)
6. [Web UIs](#6-web-uis)
7. [Real-time communication — Socket.io](#7-real-time-communication--socketio)
8. [Approach A — Kiosk conversation (voice)](#8-approach-a--kiosk-conversation-voice)
8b. [Approach B — QR check-in](#8b-approach-b--qr-check-in)
9. [Voice pipeline — STT, NLU, TTS, avatar sync](#9-voice-pipeline--stt-nlu-tts-avatar-sync)
10. [Queue engine](#10-queue-engine)
11. [Integrations status](#11-integrations-status)
12. [HTTP API reference](#12-http-api-reference)
13. [Environment variables](#13-environment-variables)
14. [Domain events](#14-domain-events)
15. [How to run and demo](#15-how-to-run-and-demo)
16. [Not yet production-ready](#16-not-yet-production-ready)
17. [Open questions for the client](#17-open-questions-for-the-client)

---

## 1. Executive summary

### The problem

At a Toyota service branch, cars queue at entry gates while staff manually verify identity. Plate recognition exists, but there is no reliable confirmation with the driver. Garage slot availability is opaque — drivers enter without knowing when a slot will free up, and no-shows waste capacity.

### The solution

**Two modules, one middleware brain:**

| Module | Role |
|--------|------|
| **Module 1 — Gate entry (dual approach)** | After LPR + SAP lookup, the driver confirms via **Approach A (voice avatar)** or **Approach B (QR check-in form)**. Either path opens the gate (with Approach B rate limits) and enqueues the visit |
| **Module 2 — Queue Management** | Single shared FIFO queue across all gates; when a garage slot frees, notify the next driver via WhatsApp (authoritative), SMS, and app push, with a **50-second claim window** and **growing push-back** on no-shows |

**Approach A — Voice / avatar:** Kiosk greets by name, confirms on-file phone by TTS/STT or touch, captures a visit phone when needed.  
**Approach B — QR check-in:** Kiosk shows a large QR (generic always-on, or a 3-minute opaque token after LPR/SAP). The driver submits plate / name / phone on a mobile form. PII never sits in the QR URL.

### Phase 1 scope

- **In scope:** Single branch, multiple entry gates, one shared queue, entry flow only, dual demo of voice and QR
- **Out of scope:** Exit flow, multi-branch scale, Arabic voice (scaffolded but disabled), production hardware integrations not yet contracted

### What this delivery includes

A **demo-ready NestJS middleware prototype** with:

- Dual Module 1 paths: voice session state machine **and** Redis-backed QR check-in tickets
- Shared queue engine with BullMQ claim timers (unchanged between approaches)
- Next.js UIs (`web/`) — QR kiosk, Voice Console, QR Console, mobile check-in form, integration logs
- ElevenLabs STT/TTS for Approach A (live)
- Stub adapters for SAP, gate, and WhatsApp so local development proceeds before vendor API schemas arrive
- End-to-end proof script (`prove_flow.sh` via check-in submit) and unit tests

![System context](diagrams/01-system-context.png)

![Dual entry approaches](diagrams/11-dual-entry-approaches.png)

---

## 2. What we are building

### System actors

| Actor / system | Role |
|----------------|------|
| **LPR camera** (one per gate) | Reads plate as car approaches; sends plate to middleware |
| **Kiosk display** (one per gate) | Approach A: voice avatar UI. Approach B: QR + Welcome name + status |
| **Driver phone** | Opens `/checkin` form from QR (Approach B) |
| **Gate controller** | Physical barrier; opens on middleware command |
| **Middleware** | Central brain — orchestrates all gates, owns check-in tickets + voice sessions, owns the queue, drives notifications |
| **SAP / SAB** | Toyota customer database — lookup by plate (read-only from middleware) |
| **Slot availability system** | Reports when garage slots become free |
| **Notification service** | WhatsApp (claim source of truth), SMS, Toyota app push (informational) |

### Business rules (resolved)

| Rule | Behaviour |
|------|-----------|
| Plate **not found** in SAP (Approach A) | Avatar shows not recognized; voice path does not open the gate |
| Plate **not found** in SAP (Approach B) | Mint LPR ticket (plate prefilled, editable); driver completes name/phone on form; submit can enqueue + open |
| SAP / middleware **unreachable** | Gate stays **closed** |
| Driver says phone on file is **wrong** (Approach A) | Ask if owner; if yes, collect visit phone by voice; **visit phone does not overwrite SAP record** |
| Edited name/phone on check-in form (Approach B) | **Visit-only** — no SAP write-back |
| Gate open (Approach B) | On **successful new-plate submit** only; **at most one open per gate per ~30s**; extras still enqueue |
| Duplicate plate already waiting | **409** already queued — no second entry, no open |
| Check-in token | Opaque Redis id, **TTL 180s**, **single use**, bound to gate + plate |
| **WhatsApp confirm** within 50s | Slot assigned; confirmation treated as guaranteed arrival |
| **Timeout** on claim | Entry pushed back N positions (N grows with consecutive misses); next FIFO head notified |
| **Retry ceiling** on queue | None — client cycles indefinitely if they keep missing notifications |
| **Staff escalation** (Approach A) | After 3 unclear retries in kiosk conversation |

![End-to-end flow Approach A](diagrams/03-end-to-end-flow.png)

![QR check-in sequence Approach B](diagrams/12-qr-checkin-sequence.png)

---

## 3. What has been delivered

Work completed August 2026 (see [`releases.md`](../../releases.md) for full changelog). Dual entry approaches are demo-ready for client presentation.

### A. Middleware core

- NestJS modular monolith: LPR, SAP, Checkin, Gate, Kiosk, Queue Engine, Notifications, Audit, Demo, TTS, STT, NLU, Integration Log
- Redis for live state (sessions, check-in tickets, queue, TTS cache, audit stream, LPR dedupe)
- BullMQ delayed jobs for 50s claim timers
- Domain event bus (`@nestjs/event-emitter`) with typed payloads and audit trail
- Correlation IDs via `x-correlation-id` header

### B. Kiosk session engine (Approach A)

- Explicit state machine — not a free-form LLM conversational agent
- States: identity confirm → owner check → phone speech → phone confirm → done / staff escalation / not recognized
- Bilingual i18n scaffolding (English active; Arabic disabled via `ARABIC_ENABLED=false`)
- Display text vs ElevenLabs speech strings split (`prompt` vs `speech` in session payload)
- Al-Sayer Hayyak branding in kiosk copy

### C. Queue engine

- Redis FIFO list with atomic Lua scripts for enqueue, shift-back, and assign
- Growing push-back on consecutive no-shows per slot cycle
- Multi-slot parallel notify via batch free endpoint
- WhatsApp confirm HTTP endpoint (stub notification adapter for demos)
- Shared by both Approach A and Approach B after enqueue

### D. Voice stack (ElevenLabs) — Approach A

- STT via ElevenLabs Scribe (`scribe_v2`)
- TTS via ElevenLabs v3 (`eleven_v3`) with audio tags and 3-3-4 digit read-out
- Redis TTS cache (SHA256 of voice+model+text)
- Retry with exponential backoff on ElevenLabs 429/5xx
- Stub adapters for offline demo without API key

### E. NLU (transcript interpretation) — Approach A

- Rules-first hybrid: yes/no and clean phone digits handled instantly
- Optional local LLM (Ollama `qwen3:0.6b`) for messy digit speech only
- 2s fail-fast timeout; falls back to rules
- EG/SA phone validation
- Read-back confirm step is the accuracy safety net

### F. Web UIs (Next.js on `:3001`)

- **QR kiosk** (`/`) — large QR, Welcome name, status (Approach B glass)
- **Voice Console** (`/console`) — avatar TTS/STT operator demo (Approach A)
- **QR Console** (`/console/qr`) — live check-in URL/QR + open form (Approach B)
- **Check-in form** (`/checkin`) — mobile plate / name / phone submit
- **Integration logs** (`/logs`) — live tail of external API calls

### G. Integration logging

- Structured logging for ElevenLabs, LPR, NLU, SAP, gate, notifications, TTS, STT
- File sink (rotating logs under `middleware/logs/`) + live WebSocket viewer
- Redaction of API keys and long bodies

### H. Tests and proof

- Unit tests: state machine, queue logic, check-in plate-lock helpers, TTS/STT/NLU specs
- `scripts/prove_flow.sh` — LPR → check-in display/ticket → `POST /checkin/submit` → queue → slot → WhatsApp

### I. Check-in module (Approach B)

- Opaque Redis tickets (`checkin:ticket:{token}`, TTL 180s), gate current ticket, plate hint, gate-open rate limit key
- HTTP: `GET /checkin/display/:gateId`, `GET /checkin/tickets/:token`, `POST /checkin/submit`
- Events: `checkin.submitted`, `checkin.display.updated`
- Socket push `checkin.display` on join and mint/submit
- Env: `CHECKIN_PUBLIC_BASE_URL`, `CHECKIN_TOKEN_TTL_SECONDS`, `GATE_OPEN_RATE_LIMIT_SECONDS`

---

## 4. Architecture overview

The middleware is a **modular monolith**: one Node.js process serves REST and WebSocket. The **Next.js** app (`web/`) is a separate process on port **3001**. Modules communicate via **domain events** rather than direct tight coupling. On SAP found/miss the middleware **dual-emits**: mint a check-in ticket (Approach B) **and** start/update a voice session (Approach A) so both demos work.

![Container diagram](diagrams/02-containers.png)

![Dual entry approaches](diagrams/11-dual-entry-approaches.png)

### NestJS modules

| Module | Responsibility |
|--------|----------------|
| `lpr` | Ingest plate reads, dedupe active plates, emit `lpr.plate.read` |
| `sap` | Lookup client profile by plate on LPR event |
| `checkin` | Opaque tickets, public form APIs, rate-limited gate open, display push |
| `kiosk` | Session state machine, Redis store, Socket.io session push (+ wires SAP → check-in mint) |
| `gate` | Open gate on voice confirm **or** check-in submit |
| `queue-engine` | FIFO queue, slot notify, claim timers, shift-back; `enqueueFromCheckin` |
| `notifications` | Send slot notifications; WhatsApp confirm endpoint |
| `audit` | Append all domain events to Redis stream |
| `demo` | Fake SAP overrides, full reset (includes `checkin:*`), config |
| `tts` / `stt` / `nlu` / `speech` | Voice pipeline with adapter seams |
| `integration-log` | Pretty file logs + live WebSocket viewer |

### Data stores

| Store | Contents |
|-------|----------|
| **Redis** | Kiosk sessions, check-in tickets / gate display / open rate limit, queue entries, LPR active-plate keys, TTS cache, audit stream, BullMQ backend |
| **Postgres** | Not implemented in this phase (design doc recommends it for durable audit history) |

---

## 5. Design patterns — adapter ports

External integrations use the **hexagonal / ports-and-adapters** pattern. Each integration has a TypeScript interface (port) and one or more implementations selected by environment variable. **Stub adapters exist so development and demos proceed locally until the actual vendor API schemas are delivered.**

![Adapter seams](diagrams/10-adapter-seams.png)

### LPR — ingest contract (not a full adapter yet)

LPR uses a stable **ingest DTO** today. When the camera vendor API schema arrives, a thin adapter maps vendor payloads into this contract without changing kiosk or queue logic.

```typescript
// POST /lpr/plate-read
{ gateId, plateNumber, timestamp?, image? }
```

### SAP / SAB — customer lookup

| | |
|--|--|
| **Port** | `SapClient.lookupByPlate(plate) → ClientProfile \| null` |
| **Today** | `FakeSapAdapter` — hardcoded `ABC 1234` + Redis demo overrides via `POST /demo/sap-profile` |
| **Future** | `SAP_ADAPTER=http` with real SAB API (reserved; throws at startup until implemented) |

### Gate controller

| | |
|--|--|
| **Port** | `GateControllerPort.openGate(gateId)` |
| **Today** | `StubGateAdapter` — logs `gate.open.stub`, no physical action |
| **Future** | `GATE_ADAPTER=real` (reserved; throws at startup until implemented) |

### WhatsApp / notifications

| | |
|--|--|
| **Port** | `NotificationSender.notify({ entryId, phone, plateNumber, slotId, channels })` |
| **Today** | `StubNotificationAdapter` — logs notification; confirm simulated via `POST /notifications/whatsapp/confirm` |
| **Future** | `NOTIFICATION_ADAPTER=real` — WhatsApp Business Cloud API + webhook (reserved) |

**Important:** Only WhatsApp confirmation counts for queue logic. SMS and app push are parallel informational pings.

### STT / TTS / NLU

| Port | Live implementation | Stub |
|------|---------------------|------|
| `SpeechTranscriber` | `ElevenLabsSttAdapter` | `StubSttAdapter` (returns `"yes"`) |
| `SpeechSynthesizer` | `ElevenLabsTtsAdapter` | `StubTtsAdapter` (silent WAV) |
| `TranscriptInterpreter` | `RulesNluAdapter` (default) | `LlmNluAdapter` (Ollama, optional) |

Env vars: `STT_ADAPTER`, `TTS_ADAPTER`, `NLU_ADAPTER`.

---

## 6. Web UIs

All UIs are **thin Next.js/React clients** in [`web/`](../../web/) (port **3001**). They call the NestJS middleware API (port **3000**) for REST and Socket.io. **Business logic lives on the server** — the browser handles presentation, QR rendering, TTS playback, STT capture, and Socket.io transport.

| UI | URL | Approach |
|----|-----|----------|
| QR kiosk | http://127.0.0.1:3001/ | B — glass QR + Welcome |
| Voice Console | http://127.0.0.1:3001/console | A — avatar TTS/STT |
| QR Console | http://127.0.0.1:3001/console/qr | B — QR preview + open form |
| Check-in form | http://127.0.0.1:3001/checkin?gate=gate-1 | B — mobile submit |
| Integration logs | http://127.0.0.1:3001/logs | Shared |

Run the web app: `cd web && npm run dev` → http://127.0.0.1:3001  
Middleware: `cd middleware && npm run start:dev` → http://127.0.0.1:3000

### 6.1 QR kiosk UI

| Path | Role |
|------|------|
| `app/page.tsx` + `features/kiosk/KioskApp.tsx` | Large QR from `checkinUrl`, Welcome name on SAP mode, status line |
| `lib/mw-api.ts` | HTTP + Socket.io (`checkin.display`) |

**URL:** http://127.0.0.1:3001/

Idle = generic `?gate=` QR. After LPR/SAP = token QR with optional Welcome name. After submit = brief submitted status then generic again.

### 6.2 Voice Console (Approach A)

| Path | Role |
|------|------|
| `app/console/page.tsx` + `features/console/ConsoleApp.tsx` | Connection, SAP, LPR, avatar, Yes/No, hold-to-speak, queue, WhatsApp |
| `components/avatar/KioskAvatar.tsx` | Avatar lip-sync |

**URL:** http://127.0.0.1:3001/console

Operator workflow: Connect → Save SAP → Send LPR → avatar greets → Yes / speak → Free slot → WhatsApp confirm → audit timeline.

### 6.3 QR Console (Approach B)

| Path | Role |
|------|------|
| `app/console/qr/page.tsx` + `features/console/QrConsoleApp.tsx` | Same SAP/LPR/queue controls; shows live check-in QR + Open form |

**URL:** http://127.0.0.1:3001/console/qr

Operator workflow: Connect → Save SAP → Send LPR → QR appears → Open check-in form → Submit on phone → Free slot → WhatsApp confirm.

### 6.4 Mobile check-in form

| Path | Role |
|------|------|
| `app/checkin/page.tsx` + `features/checkin/CheckinForm.tsx` | Prefill from token; lock plate when `plateLocked`; 410 fallback; success / already-queued |

**URL:** http://127.0.0.1:3001/checkin?gate=gate-1&t=TOKEN

Talks to middleware via `createMwApi` (not Next server actions). Set `CHECKIN_PUBLIC_BASE_URL` to a phone-reachable absolute URL in a real lane (not `localhost`).

### 6.5 Integration logs UI

| Path | Role |
|------|------|
| `app/logs/page.tsx` + `features/logs/LogsApp.tsx` | Filterable live log viewer |
| Socket.io `/logs` on middleware | `logs.subscribe`, backlog + live tail |

**URL:** http://127.0.0.1:3001/logs

### UI design approach

- **Approach A:** Server-driven `session.update` with `prompt` / `speech`; avatar lip-sync from TTS RMS; touch fallback when STT fails
- **Approach B:** Server-driven `checkin.display` with `mode`, `checkinUrl`, `customerName`, `expiresAt`; client renders QR via `qrcode`

---

## 7. Real-time communication — Socket.io

Next.js clients connect to the NestJS API origin (port **3000**). Two WebSocket namespaces are used.

![Socket.io communication](diagrams/08-socket-html-backend.png)

### Namespace `/kiosk` — dual display

| Direction | Event | Payload | Notes |
|-----------|-------|---------|-------|
| Client → Server | `kiosk.join` | `{ gateId }` | Joins room `gate:{gateId}`; ack may include current display |
| Server → Client | `checkin.display` | `CheckinDisplay` | Approach B — generic / lpr / sap / submitted |
| Server → Client | `session.update` | `PublicSession` | Approach A — voice session |
| Client → Server | `session.input` | `{ sessionId, source, choice?, text?, phone_digits? }` | Approach A ack `{ ok, session }` |

**REST fallback (voice):** `POST /session/:sessionId/input` when socket is disconnected.  
**REST (check-in):** `GET /checkin/display/:gateId` for polling/initial load.

### CheckinDisplay payload (key fields)

| Field | Description |
|-------|-------------|
| `mode` | `generic` \| `lpr` \| `sap` \| `submitted` |
| `gateId`, `checkinUrl` | Absolute form URL for QR |
| `customerName`, `plateNumber` | Optional Welcome / plate on glass |
| `expiresAt`, `token` | Present for token modes |

### Namespace `/logs` — integration monitoring

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `logs.subscribe` | `{ integration: 'all' \| 'elevenlabs' \| ... }` |
| Server → Client | `logs.backlog` | Initial buffered lines |
| Server → Client | `logs.line` | New log line (live tail) |

### PublicSession payload (key fields)

| Field | Description |
|-------|-------------|
| `session_id`, `gate_id`, `state`, `lang` | Session identity |
| `profile.name`, `profile.phone_display` | Masked phone (e.g. `050-XXX-4567`) |
| `prompt`, `speech` | Display vs TTS text |
| `avatar_state` | `idle` / `talking` / `listening` |
| `retries`, `max_retries` | Retry counter (max 3) |
| `gate_open_stub` | Whether gate stub fired |

---

## 8. Approach A — Kiosk conversation (voice)

The kiosk uses an **explicit server-side state machine** — not a free-form LLM agent. NLU only extracts yes/no and phone digits from STT transcripts; the state machine decides what to ask next. Use **Voice Console** (`/console`) to present this approach.

![Kiosk state machine](diagrams/04-kiosk-conversation.png)

### States

| State | Meaning |
|-------|---------|
| `awaiting_identity_confirm` | Greet by name; confirm masked phone on file |
| `awaiting_owner_check` | Driver said phone wrong — are you the owner? |
| `awaiting_phone_speech` | Owner speaks alternate visit phone |
| `awaiting_phone_confirm` | Read back heard digits; confirm |
| `done` | Visit complete — gate open + enqueue |
| `staff_escalation` | Max retries or not owner |
| `not_recognized` | SAP lookup failed — gate stays closed |

### Known customer — happy path

![Known customer sequence](diagrams/05-known-customer-sequence.png)

1. LPR sends plate → SAP returns profile
2. Middleware creates session → pushes to kiosk via Socket.io
3. Avatar greets and asks to confirm phone
4. Driver says **Yes** (voice or touch)
5. Gate stub opens → visit enqueued with on-file phone

### Driver not owner — visit phone capture

![Driver not owner sequence](diagrams/06-driver-not-owner-sequence.png)

1. Driver says phone on file is **wrong**
2. Avatar asks: are you the owner?
3. If **yes** → driver speaks visit phone → STT + NLU extract digits
4. Avatar reads back digits → driver confirms
5. Gate opens → enqueued with **visit phone only** — SAP owner record unchanged

### i18n and branding

- Copy uses **Al-Sayer Hayyak** brand voice
- `display` strings are clean screen text; `speech` strings include ElevenLabs v3 audio tags (`[warmly]`, pauses) and spelled-out phone digits (3-3-4 pattern)
- Arabic translations exist in code but are disabled (`ARABIC_ENABLED=false`); language picker hidden in UI

---

## 8b. Approach B — QR check-in

Drivers confirm on a **mobile form** reached by QR. The kiosk glass shows a large QR and optional Welcome name — no phone number on the glass. Use **QR Console** (`/console/qr`) and the **QR kiosk** (`/`) to present this approach.

![QR check-in sequence](diagrams/12-qr-checkin-sequence.png)

![Check-in ticket lifecycle](diagrams/13-checkin-ticket-lifecycle.png)

![Check-in API and display](diagrams/14-checkin-api-display.png)

### Paths

| Path | Trigger | Form behaviour |
|------|---------|----------------|
| **A — Generic QR** | Always on (idle kiosk or printed) | Empty plate / name / phone; `gateId` from query |
| **B — LPR + SAP miss** | Token mint `source=lpr` | Plate prefilled, **editable**; name/phone empty |
| **C — LPR + SAP hit** | Token mint `source=sap` | Plate **locked**; name/phone prefilled, editable |

### Settled rules

- Token is an **opaque** Redis id — PII is never in the QR query string
- TTL **180 seconds**, **single use**, bound to `gateId` + plate
- Expired/used token → **410**; form falls back to generic for that gate (plate hint kept if LPR still live)
- Submit → `enqueueFromCheckin`; if `created === false` → **409** already queued (no gate open)
- New plate → emit `checkin.submitted` → open gate only if `SET NX EX` on `checkin:gate:open:{gateId}` succeeds (~30s)
- Edited name/phone are **visit-only** — no SAP write-back
- After enqueue, Module 2 slot-free → WhatsApp/SMS/app claim is **unchanged**

### Redis keys

| Key | Purpose |
|-----|---------|
| `checkin:ticket:{token}` | Ticket JSON (TTL 180s) |
| `checkin:gate:{gateId}` | Current token for kiosk display |
| `checkin:gate:{gateId}:plate` | Plate hint after expiry |
| `checkin:gate:open:{gateId}` | Gate-open rate limit (NX EX ~30s) |

---

## 9. Voice pipeline — STT, NLU, TTS, avatar sync

*(Approach A only — unused on the QR glass path, but required for Voice Console demos.)*

![Voice and avatar pipeline](diagrams/07-voice-avatar-pipeline.png)

### Flow (one voice answer turn)

1. Server pushes `session.update` with `speech` field
2. Client calls `POST /tts` with `{ text: speech, lang }` → ElevenLabs returns MP3 (cached in Redis)
3. `AvatarController.playWavAndLipSync()` — Web Audio RMS drives mouth openness
4. Driver holds record button → `MediaRecorder` captures audio
5. Client calls `POST /stt` (multipart `audio` + `lang`)
6. Middleware: ElevenLabs transcribe → `NluService.interpret()` → `{ text, normalized, digits }`
7. Client sends `session.input` via Socket.io
8. State machine transitions → new `session.update` → repeat from step 1

### ElevenLabs configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| `ELEVENLABS_STT_MODEL_ID` | `scribe_v2` | Speech-to-text |
| `ELEVENLABS_TTS_MODEL_ID` | `eleven_v3` | Text-to-speech (required for audio tags) |
| `ELEVENLABS_TTS_VOICE_ID` | — | Voice selection (required for live TTS) |
| `ELEVENLABS_TTS_OUTPUT_FORMAT` | `mp3_44100_128` | Audio format |
| `TTS_CACHE_TTL_SECONDS` | `86400` | Redis cache TTL |

**Note:** Live ElevenLabs requires outbound internet from the kiosk/middleware host. Use `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for air-gapped demos; touch input remains available.

### NLU strategy (latency-first)

1. Rules normalize yes/no and extract digits instantly
2. Pure yes/no (no long digit run) → return immediately — no LLM call
3. Clean valid EG/SA phone from rules → skip LLM
4. If `NLU_ADAPTER=llm` and speech is ambiguous → call Ollama with 2s timeout
5. LLM timeout or error → fall back to rules
6. Phone confirm read-back catches extraction errors

### Avatar rendering

- **Default:** Procedural canvas face; mouth driven by `mouthOpen` 0..1 from audio amplitude
- **Optional:** Rive animation (`avatar.riv`) if present — state machine inputs `idle`/`talking`/`listening`

---

## 10. Queue engine

![Queue claim flow](diagrams/09-queue-claim-flow.png)

### Data model (Redis)

| Key | Purpose |
|-----|---------|
| `qms:queue` | Ordered list of entry IDs (FIFO) |
| `qms:entry:{id}` | Entry JSON (plate, phone, status, gate, timestamps) |
| `qms:plate:{PLATE}` | Idempotency — one active entry per plate |
| `qms:claim:{slotId}` | Active claim for a slot |
| `slots:available` | Count of free slots awaiting batch notify |

### Entry statuses

`waiting` → `notified` → `confirmed` → `assigned`  
On timeout: `skipped` (re-eligible at next peek)

### Push-back algorithm

When a driver does not confirm within **50 seconds** (`CLAIM_TIMEOUT_MS`):

- 1st consecutive miss → shift back **1** position  
- 2nd consecutive miss → shift back **2** positions  
- Nth miss → shift back **N** positions  
- Counter resets when someone confirms

**Example:** Queue `[1, 2, 3, 4]` → 1 times out → `[2, 1, 3, 4]` → 2 times out → `[3, 1, 2, 4]` → 3 confirms → slot assigned to 3.

### Multi-slot

When N slots free simultaneously, up to N queue heads are notified in parallel, each with its own 50s timer and slot reservation.

### Triggering slot free (today)

Production: slot availability system webhook or poll (contract TBD).  
**Demo:** `POST /slots/freed` or `POST /slots/freed-batch` from console.

---

## 11. Integrations status

| Integration | Status | Implementation | Notes |
|-------------|--------|----------------|-------|
| **ElevenLabs STT** | **Live** | `ElevenLabsSttAdapter` | Requires API key + outbound HTTPS |
| **ElevenLabs TTS** | **Live** | `ElevenLabsTtsAdapter` | Requires API key + voice ID |
| **NLU rules** | **Live** | `RulesNluAdapter` | Default; no external dependency |
| **NLU LLM** | Optional | `LlmNluAdapter` | Ollama at `NLU_BASE_URL`; not required for demo |
| **SAP / SAB** | **Stub** | `FakeSapAdapter` + demo Redis overrides | Real HTTP adapter reserved |
| **Gate controller** | **Stub** | `StubGateAdapter` | Logs open command only |
| **WhatsApp / SMS / App** | **Stub** | `StubNotificationAdapter` | Confirm via HTTP simulate endpoint |
| **LPR camera** | **Ingest only** | `POST /lpr/plate-read` | Vendor adapter maps to DTO when schema arrives |
| **Slot availability** | **Manual trigger** | `POST /slots/freed` | Webhook/poll adapter when contract known |

---

## 12. HTTP API reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check; reports active TTS/STT adapters |
| POST | `/lpr/plate-read` | Camera plate ingest |
| GET | `/checkin/display/:gateId` | Current kiosk check-in display (generic or token URL) |
| GET | `/checkin/tickets/:token` | Prefill payload; **410** if missing/used/expired (`?gateId=` for plate hint) |
| POST | `/checkin/submit` | `{ token?, gateId, plateNumber, name, phone }` → enqueue; **409** if already queued |
| POST | `/session/start` | Manual dual start (voice session + SAP-style ticket) for tests |
| GET | `/session/:id` | Session snapshot |
| POST | `/session/:id/input` | Touch/STT input (REST fallback) |
| POST | `/tts` | Text-to-speech `{ text, lang }` → audio bytes |
| POST | `/stt` | Speech-to-text multipart `audio` → `{ text, normalized, digits }` |
| GET | `/queue` | Live queue entries |
| GET | `/slots/available` | Available free slots + active claims |
| PUT | `/slots/available` | Set available slot count `{ available }` |
| POST | `/slots/freed` | Single slot free → notify next |
| POST | `/slots/freed-batch` | Free N slots → notify up to N waiting |
| POST | `/notifications/whatsapp/confirm` | WhatsApp claim confirm |
| GET | `/audit/events?limit=N` | Recent domain-event audit trail |
| GET | `/demo/config` | Demo config (`claimTimeoutMs`) |
| POST | `/demo/sap-profile` | Register fake-SAP override for a plate |
| POST | `/demo/reset` | Clear queue, sessions, LPR, check-in, TTS cache, demo, audit |

### WebSocket namespaces

| Namespace | Events |
|-----------|--------|
| `/kiosk` | `kiosk.join`, `session.input`, push `session.update`, push `checkin.display` |
| `/logs` | `logs.subscribe`, push `logs.backlog` / `logs.line` |

---

## 13. Environment variables

Validated in `middleware/src/config/env.validation.ts`. Copy `middleware/.env.example` to `.env`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Pino log level |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `""` | Redis password |
| `REDIS_DB` | `0` | Redis database index |
| `CLAIM_TIMEOUT_MS` | `50000` | Queue claim window (ms) |
| `SESSION_TTL_SECONDS` | `1800` | Kiosk session TTL in Redis |
| `SAP_ADAPTER` | `fake` | `fake` \| `http` (http not implemented) |
| `SAP_BASE_URL` | `""` | Reserved for HTTP SAP adapter |
| `GATE_ADAPTER` | `stub` | `stub` \| `real` (real not implemented) |
| `NOTIFICATION_ADAPTER` | `stub` | `stub` \| `real` (real not implemented) |
| `TTS_ADAPTER` | `elevenlabs` | `elevenlabs` \| `stub` |
| `STT_ADAPTER` | `elevenlabs` | `elevenlabs` \| `stub` |
| `ELEVENLABS_API_KEY` | `""` | Required for live ElevenLabs |
| `ELEVENLABS_TTS_VOICE_ID` | `""` | ElevenLabs voice ID |
| `ELEVENLABS_TTS_MODEL_ID` | `eleven_v3` | TTS model |
| `ELEVENLABS_TTS_OUTPUT_FORMAT` | `mp3_44100_128` | Audio output format |
| `ELEVENLABS_STT_MODEL_ID` | `scribe_v2` | STT model |
| `TTS_CACHE_TTL_SECONDS` | `86400` | Redis TTS cache TTL |
| `CORS_ORIGINS` | localhost URLs | Comma-separated CORS origins (include `:3001`) |
| `CHECKIN_PUBLIC_BASE_URL` | `http://127.0.0.1:3001/checkin` | Absolute URL phones open from QR |
| `CHECKIN_TOKEN_TTL_SECONDS` | `180` | Opaque ticket TTL |
| `GATE_OPEN_RATE_LIMIT_SECONDS` | `30` | Max one gate-open per gate in this window |
| `NLU_ADAPTER` | `rules` | `rules` \| `llm` |
| `NLU_BASE_URL` | `http://127.0.0.1:11434/v1` | LLM server (Ollama) |
| `NLU_MODEL` | `qwen3:0.6b` | LLM model name |
| `NLU_TIMEOUT_MS` | `2000` | LLM timeout; fallback to rules |
| `PHONE_REGIONS` | `EG,SA` | Accepted phone regions |
| `INTEGRATION_LOG_ENABLED` | `true` | Enable integration logging |
| `INTEGRATION_LOG_DIR` | `logs` | Log file directory |
| `INTEGRATION_LOG_MAX_BODY_CHARS` | `2000` | Max chars per logged body |
| `INTEGRATION_LOG_MAX_FILE_MB` | `10` | Log rotation size |
| `INTEGRATION_LOG_ROTATE_KEEP` | `3` | Rotated files to keep |

---

## 14. Domain events

All events are typed in `middleware/src/events/domain-events.ts` and appended to the audit Redis stream.

| Event | Emitter | Typical listeners |
|-------|---------|-------------------|
| `lpr.plate.read` | LPR | SAP |
| `sap.lookup.found` | SAP | Kiosk (mint SAP ticket + start voice session) |
| `sap.lookup.not_found` | SAP | Kiosk (mint LPR ticket + not_recognized session) |
| `kiosk.session.started` | Kiosk | Audit |
| `kiosk.identity.confirmed` | Kiosk | Gate, Queue (Approach A) |
| `kiosk.phone.captured` | Kiosk | Gate, Queue (Approach A) |
| `kiosk.staff.escalation` | Kiosk | Audit |
| `checkin.submitted` | Checkin | Audit (gate already opened by service if rate limit OK) |
| `checkin.display.updated` | Checkin | KioskGateway → `checkin.display` |
| `gate.open.commanded` | Gate | Audit |
| `gate.opened` | Gate | Audit |
| `queue.enqueued` | Queue | Audit |
| `slot.freed` | Queue | Audit |
| `queue.notified` | Queue | Notifications |
| `queue.claim.confirmed` | Notifications | Queue |
| `queue.claim.timeout` | Queue (BullMQ) | Audit |
| `queue.shifted` | Queue | Audit |
| `queue.assigned` | Queue | Audit |

---

## 15. How to run and demo

### Prerequisites

- Node.js 20+
- Docker (Redis 7)
- ElevenLabs API key (optional — use stub adapters without)

### Start

```bash
cd middleware
cp .env.example .env
# Set CHECKIN_PUBLIC_BASE_URL to a phone-reachable URL for real-lane demos
npm install
docker compose up -d
npm run start:dev

# other terminal
cd web && npm install && npm run dev
```

### Approach A — Voice Console walkthrough

1. Open http://127.0.0.1:3001/console
2. **Connect** to middleware (`http://127.0.0.1:3000`)
3. **Save SAP profile** — plate, name, phone
4. **Send LPR plate read** — same plate
5. Avatar greets → click **Yes** or hold-to-speak
6. **Set available slots** → **Free batch**
7. **WhatsApp confirm** → watch audit timeline

### Approach B — QR Console walkthrough

1. Open http://127.0.0.1:3001/console/qr (and optionally kiosk at `/`)
2. **Connect** → **Save SAP** → **Send LPR plate**
3. Check-in QR appears (Welcome name on SAP hit)
4. **Open check-in form** → confirm/edit fields → **Join queue**
5. Queue row appears → Free slot → WhatsApp confirm (same as Approach A from here)

Reset between demos if reusing the same plate: **Reset demo run**.

### Automated proof (Approach B)

```bash
cd middleware
npm test
npm run prove
# or: bash scripts/prove_flow.sh http://127.0.0.1:3000
```

Proof path: reset → seed SAP → LPR → `GET /checkin/display` → submit → 409 duplicate check → slot freed → WhatsApp confirm.

---

## 16. Not yet production-ready

The following items are **designed** (see solution design and presentation) but **not implemented** in this repository delivery:

| Item | Design intent | Current state |
|------|---------------|---------------|
| Real SAP/SAB HTTP API | Production customer lookup | Fake adapter + demo overrides |
| Real gate controller | MQTT or device API | Stub logs only |
| WhatsApp Business Cloud | Authoritative claim webhook | Stub + HTTP simulate confirm |
| Slot availability webhook | Automatic slot-free events | Manual `POST /slots/freed` |
| LPR vendor adapter | Camera-specific protocol | HTTP ingest DTO only |
| Android kiosk shell | Kiosk-mode lockdown + WebView | Browser UI only (QR or voice) |
| Public lane check-in URL | Phone-reachable HTTPS for QR | Default localhost for demos |
| PostgreSQL audit | Durable history | Redis stream only |
| On-prem voice (Vosk/Piper) | Air-gapped branch option | ElevenLabs cloud (Option B shipped) |
| Arabic voice UI | Phase 2 bilingual avatar | Scaffolded, disabled |
| On-site pilot | Week 6 one-gate deployment | Demo/prove scripts only |

---

## 17. Open questions for the client

These decisions from the executive presentation remain open and block production integration:

1. **Production Module 1 preference** — Voice avatar (Approach A), QR check-in (Approach B), or both in parallel per gate?
2. **Kiosk platform** — Windows, Ubuntu, Android kiosk shell, or TBD?
3. **AI voice strategy** (if Approach A) — Hosted APIs (current ElevenLabs path) vs full on-prem STT/TTS vs hybrid?
4. **Public check-in base URL** (Approach B) — Phone-reachable HTTPS origin for QR links in the lane (not localhost)
5. **Slot availability contract** — Webhook push vs polling from the slot system owner?
6. **LPR read failure** — Generic QR only vs retry vs route to staff?

### Blockers to start production integrations

- SAP API credentials and contract
- LPR and gate controller hardware access
- Slot system owner and API shape
- WhatsApp Business Cloud account and webhook URL
- On-prem server provisioning and pilot gate selection
- Decision on Approach A vs B (or dual) for the pilot gate

---

## Appendix — diagram sources

All diagrams are version-controlled as Mermaid (`.mmd`) under `docs/client/diagrams/` and exported as PNG for this document. Edit the `.mmd` file and re-export with:

```bash
cd docs/client/diagrams
npx -y @mermaid-js/mermaid-cli -i <file>.mmd -o <file>.png -b white -p puppeteer-config.json
```

| File | Description |
|------|-------------|
| `01-system-context.mmd` | C4 system context (voice + QR phone) |
| `02-containers.mmd` | C4 container diagram (Next UIs + CheckinModule) |
| `03-end-to-end-flow.mmd` | Approach A — voice visit + shared queue |
| `04-kiosk-conversation.mmd` | Approach A — kiosk state machine |
| `05-known-customer-sequence.mmd` | Approach A — happy path sequence |
| `06-driver-not-owner-sequence.mmd` | Approach A — visit phone capture |
| `07-voice-avatar-pipeline.mmd` | Approach A — STT/TTS/avatar |
| `08-socket-html-backend.mmd` | Socket.io: `session.update` + `checkin.display` |
| `09-queue-claim-flow.mmd` | Queue notify and claim (shared Module 2) |
| `10-adapter-seams.mmd` | Adapter port diagram |
| `11-dual-entry-approaches.mmd` | Side-by-side Approach A vs B |
| `12-qr-checkin-sequence.mmd` | Approach B — generic / LPR / SAP paths |
| `13-checkin-ticket-lifecycle.mmd` | Opaque token mint / TTL / single use |
| `14-checkin-api-display.mmd` | Check-in HTTP + socket display |

---

*End of document*
