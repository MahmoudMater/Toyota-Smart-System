# Toyota Smart Gate & Queue — Tamkeen Phase 1

**Tamkeen solution proposal for Toyota (Al-Sayer Hayyak):** a voice-driven smart gate and shared garage-slot queue for a single branch. One NestJS middleware orchestrates LPR plate reads, SAP customer lookup, kiosk avatar sessions, gate commands, and fair slot notifications with a 50-second WhatsA**Business rules (resolved**p claim window.

## What this repo contains


| Path                                                                                                             | Purpose                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `[middleware/](middleware/)`                                                                                     | **Main product** — NestJS modular monolith, Redis, BullMQ, Socket.io, kiosk UIs |
| `[presentation/](presentation/)`                                                                                 | CEO/CTO slide deck (reveal.js)                                                  |
| `[toyota-gate-queue-system-design.md](toyota-gate-queue-system-design.md)`                                       | Authoritative solution design                                                   |
| `[docs/client/Toyota-Smart-Gate-Technical-Handover.md](docs/client/Toyota-Smart-Gate-Technical-Handover.md)`     | **Client technical handover** (full detail)                                     |
| `[docs/client/Toyota-Smart-Gate-Technical-Handover.docx](docs/client/Toyota-Smart-Gate-Technical-Handover.docx)` | Same document as Word for delivery                                              |
| `[docs/client/diagrams/](docs/client/diagrams/)`                                                                 | Mermaid sources (`.mmd`) and exported PNGs                                      |
| `[releases.md](releases.md)`                                                                                     | Development changelog                                                           |




## System context

System context diagram

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


| UI                   | URL                                                                      | Purpose                                                       |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Kiosk**            | [http://127.0.0.1:3000/](http://127.0.0.1:3000/)                         | Voice avatar, touch input, STT/TTS sandbox                    |
| **Demo console**     | [http://127.0.0.1:3000/console.html](http://127.0.0.1:3000/console.html) | End-to-end demo: LPR → SAP → visit → queue → WhatsApp confirm |
| **Integration logs** | [http://127.0.0.1:3000/logs.html](http://127.0.0.1:3000/logs.html)       | Live tail of ElevenLabs, SAP, LPR, gate, notification calls   |




### Demo console walkthrough

1. Open **console.html** → Connect → Save SAP profile → Send LPR plate
2. Avatar greets the driver → confirm **Yes** on phone
3. **Free a slot** → simulate **WhatsApp confirm**
4. Watch the audit timeline for the full domain-event story



## End-to-end flow

End-to-end flow

## Stack

- **Backend:** NestJS (TypeScript), Redis, BullMQ, Socket.io
- **Voice:** ElevenLabs STT (`scribe_v2`) + TTS (`eleven_v3`) with Redis cache; stub adapters for offline
- **NLU:** Rules-first yes/no and phone extraction; optional local LLM (Ollama) for messy digit speech
- **Integrations:** Adapter pattern — SAP, Gate, WhatsApp are **stubs today** so development continues until vendor API schemas arrive
- **UI:** Thin HTML/JS clients; all session logic on the server; avatar lip-sync via Web Audio RMS



## Documentation

- **Developer API reference:** `[middleware/README.md](middleware/README.md)`
- **Client technical handover (Word):** `[docs/client/Toyota-Smart-Gate-Technical-Handover.docx](docs/client/Toyota-Smart-Gate-Technical-Handover.docx)`
- **Executive presentation:** `[presentation/README.md](presentation/README.md)`



## Tests

```bash
cd middleware
npm test
# With middleware + Redis running:
bash scripts/prove_flow.sh http://127.0.0.1:3000
```

