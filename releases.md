# Releases

## [2026-08-11 12:45] Move TTS/STT to ElevenLabs in middleware; delete Python voice service

**By:** @MahmoudMater

**Requested:** Change TTS to ElevenLabs instead of Piper, move all TTS/STT/voice logic from kiosk-voice/server into middleware as NestJS modules

**Changes:**
- Created `modules/speech/` (ElevenLabs fetch client), `modules/tts/` (TTS with Redis cache, ElevenLabs + stub adapters), `modules/stt/` (STT with ElevenLabs Scribe + stub adapters) following the env-driven adapter-seam convention
- Moved `modules/kiosk/normalize.ts` to `src/common/normalize.ts` (shared by kiosk state machine + STT service)
- Added `TTS_ADAPTER`, `STT_ADAPTER`, `ELEVENLABS_*`, `TTS_CACHE_TTL_SECONDS` to `config/env.validation.ts` and `.env.example`
- Moved `kiosk-voice/kiosk-ui/` to `middleware/public/` and added `@nestjs/serve-static` — single process on :3000
- Removed `voiceUrl` plumbing from `mw-api.js`, `console.js`, `console.html`; `avatar.js` `playWavAndLipSync` now accepts mime type
- Deleted entire `kiosk-voice/` directory (Python server, Piper voices, faster-whisper, venv)
- Added `tts.service.spec.ts` (5 tests) and `stt.service.spec.ts` (6 tests); all 19 tests pass

**Notes:** Set `ELEVENLABS_API_KEY` and `ELEVENLABS_TTS_VOICE_ID` in `.env` for real speech, or use `TTS_ADAPTER=stub` / `STT_ADAPTER=stub` for demos without a key. The kiosk now requires outbound internet to ElevenLabs when using the elevenlabs adapter; touch keypad works as degraded fallback.

## [2026-08-11 12:30] Implement all 7 architecture deepening candidates for middleware

**By:** @mahmoudgamalmatter

**Requested:** Implement all architecture deepening candidates from the review (absorb slots, deepen repo, fix circular DI, deepen event bus, wire adapter seams, fix demo reach, centralize plate lifecycle).

**Changes:**
- Absorbed SlotsModule into QueueEngineModule — deleted `slots/slots.service.ts`, `slots/slots.module.ts`, `slots/slots.controller.ts`; moved slot logic into `queue-engine/queue-engine.service.ts` and new `queue-engine/slots.controller.ts`
- Deepened QueueRepository with `reserveNextForSlot()` and `confirmAndAssign()` high-level methods, simplified service orchestration
- Fixed KioskGateway circular DI using `forwardRef`, removed manual `bindService()` hack and `OnModuleInit` wiring in `kiosk/kiosk.module.ts`
- Added `BaseDomainPayload` base type, unified `GateOpenCommandedPayload`/`GateOpenedPayload` into `GateEventPayload`, added typed `DomainEventMap` for compile-time event safety in `events/domain-events.ts`
- Wired env-driven adapter factories for Gate, Notifications, and SAP modules; added `GATE_ADAPTER` and `NOTIFICATION_ADAPTER` env vars to `config/env.validation.ts` and `.env.example`
- Added `purge()` methods to QueueRepository, SessionStore, LprService, AuditService; refactored DemoService to call module-owned purge instead of scanning Redis keys cross-module; moved `DEMO_SAP_KEY` into `sap/fake-sap.adapter.ts`
- Centralized plate lifecycle TTLs into `PlateActiveReason` enum and `TTL_BY_REASON` map in `lpr/lpr.service.ts`; callers now pass reason instead of raw TTL values

**Notes:** All 8 unit tests pass. TypeScript compiles cleanly. The `dto/slot-freed.dto.ts` file is kept under `queue-engine/dto/` (old copy under `slots/dto/` remains for reference but is unused). Architecture HTML report at `/tmp/architecture-review-20260811.html`.

## [2026-08-11 12:00] Full middleware code review + architecture deepening scan

**By:** @mahmoudgamalmatter

**Requested:** Full review of the middleware codebase — two-axis code review (Standards + Spec) and architecture deepening opportunity scan with HTML report.

**Changes:**
- Ran two-axis code review (Standards smell baseline + Spec coverage) across `middleware/` diff since `38fc949`
- Produced architecture deepening scan with 7 candidates (2 Strong, 4 Worth exploring, 1 Speculative)
- Generated self-contained HTML report at `/tmp/architecture-review-20260811.html` (Tailwind + Mermaid)

**Notes:** No `CODING_STANDARDS.md` or `CONTEXT.md` exists — Standards axis ran purely on Fowler smell baseline. Spec axis used the demo-console plan and README as closest available specs. Top architecture recommendation: absorb SlotsModule into QueueEngineService.

## [2026-08-09 17:15] Multi-slot free + concurrent queue notifies

**By:** @MahmoudMater

**Requested:** Define available free slots from console; notify N waiting customers correctly

**Changes:**
- Queue engine: per-slot claims + notify lock (N free slots → N concurrent notifies)
- Slots API: `GET/PUT /slots/available`, `POST /slots/freed-batch`
- Demo console: available-slots control, batch free, per-claim WhatsApp confirm + countdowns

**Notes:** Restart middleware; hard-refresh console. Set available N → Free slots & notify.

## [2026-08-09 17:00] Console: absolute Voice URL for TTS/STT

**By:** @MahmoudMater

**Requested:** Fix TTS 404 when opening console via VS Code Live Preview

**Changes:**
- Added Voice URL field (default `http://127.0.0.1:8080`); TTS/STT go through `mw-api.js` absolute URLs
- Connect checks voice `/health` as well as middleware

**Notes:** Start uvicorn on :8080; open `http://127.0.0.1:8080/console.html` (not Live Preview).

## [2026-08-09 16:58] Demo console UI + DemoModule

**By:** @MahmoudMater

**Requested:** Configurable demo console to simulate LPR/SAP, avatar flow, queue notify for CTO/CEO demos

**Changes:**
- Middleware `DemoModule`: `POST /demo/sap-profile`, `GET /demo/config`, `POST /demo/reset`; FakeSapAdapter reads Redis overrides
- Kiosk UI `console.html` + `console.js` + `mw-api.js` (UI service layer) for full-flow demo

**Notes:** Open `http://127.0.0.1:8080/console.html` with voice server + middleware running. Demo API e2e and `prove_flow.sh` OK.

## [2026-08-09 16:35] Fix BullMQ claim jobId (no colons)

**By:** @MahmoudMater

**Requested:** Summary of prove_flow failure / fix claim timer

**Changes:**
- BullMQ custom `jobId` no longer uses `:` (`claim-…` instead) in `queue-engine.service.ts`
- `scripts/prove_flow.sh` asserts `notified` then empty queue after WhatsApp confirm

**Notes:** Restart middleware and re-run prove; flush Redis if leftover entries from the failed run.

## [2026-08-09 16:12] Fix TS1272 import type for decorated signatures

**By:** @MahmoudMater

**Requested:** Fix type-check errors TS1272 on decorated signatures

**Changes:**
- Split value vs `import type` in gate, kiosk, sap, notifications, and queue-engine services

**Notes:** `npm run type-check` passes.

## [2026-08-09 16:09] NestJS middleware scaffold (events, Redis, BullMQ, kiosk)

**By:** @MahmoudMater

**Requested:** Implement NestJS middleware with event-driven modules, Redis, BullMQ queue, sockets for kiosks

**Changes:**
- Added `middleware/` NestJS modular monolith (LPR, SAP, Gate, Kiosk, Queue Engine, Notifications, Slots, Audit)
- Redis + BullMQ claim timers; Socket.io `/kiosk` namespace; structured pino + audit stream
- Rewired `kiosk-voice/kiosk-ui` session flow to middleware (TTS/STT stay on Python)
- Unit tests for state machine + queue shift-back; `middleware/scripts/prove_flow.sh`

**Notes:** Run `npm install`, `docker compose up -d`, `cp .env.example .env`, then `npm run start:dev` in `middleware/`.

## [2026-08-09 15:14] Session handoff for kiosk voice Phase 1

**By:** @MahmoudMater

**Requested:** Use session-handoff skill to hand off everything in this session

**Changes:**
- Created `.claude/handoffs/2026-08-09-151347-kiosk-voice-phase1-pipeline.md`
- Validated via session-handoff scripts

**Notes:** Next agent: restart uvicorn, smoke-test English flow, optional fix lessac-high download.

## [2026-08-09 14:47] Default English; disable Arabic for now

**By:** @MahmoudMater

**Requested:** Make default language English and remove Arabic until later

**Changes:**
- `ARABIC_ENABLED=False`, `DEFAULT_LANG=en` in `server/i18n.py`
- Skip language picker; English greet → phone confirm in `state_machine.py`
- Hide language buttons; TTS/STT default English
- Updated README + prove script

**Notes:** Re-enable later via `ARABIC_ENABLED=True` + restore language step.

## [2026-08-09 14:11] TTS fallback when lessac-high is corrupt

**By:** @MahmoudMater

**Requested:** Fix POST /tts 500 InvalidProtobuf on en_US-lessac-high.onnx

**Changes:**
- `server/tts.py` skips unloadable/corrupt ONNX and falls back to lessac-medium

**Notes:** Optional clean re-download of lessac-high with --force-redownload

## [2026-08-09 14:02] Improve Piper TTS clarity

**By:** @MahmoudMater

**Requested:** Voice sounds very bad — how to make it better

**Changes:**
- Prefer `en_US-lessac-high`, tuned SynthesisConfig (slower/clearer) in `server/tts.py`
- Arabic-only language prompt; phone digits spoken as words in `server/i18n.py`

**Notes:** Download `en_US-lessac-high`. Piper Arabic has no "high" model — quality ceiling is medium.

## [2026-08-09 13:57] Arabic-default language selection on kiosk

**By:** @MahmoudMater

**Requested:** Default language Arabic; after greeting ask Arabic or English (voice/touch)

**Changes:**
- New `awaiting_language` step + `i18n.py` prompts in `kiosk-voice/server/`
- Dual-voice TTS, STT lang param, UI language buttons/RTL in `kiosk-ui/`
- Documented Arabic voice download in README; PROGRESS updated

**Notes:** Download `ar_JO-kareem-medium` then restart uvicorn.

## [2026-08-09 13:55] Close Phase 1 plan gaps (prove + avatar + STT preload)

**By:** @MahmoudMater

**Requested:** Check plan for missing items and implement correctly

**Changes:**
- STT preload on startup in `kiosk-voice/server/app.py`
- Session curl prover `kiosk-voice/scripts/prove_session_flow.sh` (A/B/C flows pass)
- Avatar state badge + optional Rive file detect; wire `avatar_state` in `kiosk-ui/`
- Updated `kiosk-voice/README.md` + `PROGRESS.md`

**Notes:** Restart uvicorn for STT preload. Canvas lip sync satisfies Stage 4 until a `.riv` is added.

## [2026-08-09 13:49] Kiosk greeting asks phone only

**By:** @MahmoudMater

**Requested:** After greeting, do not ask "is this you"; make vehicle info a statement and only ask about the phone number

**Changes:**
- Updated greeting copy in `kiosk-voice/server/state_machine.py`
- Logged in `kiosk-voice/PROGRESS.md`

**Notes:** Restart uvicorn and start a new visit to hear the new prompt.

## [2026-08-09 13:37] Fix STT cuBLAS crash by forcing CPU Whisper

**By:** @MahmoudMater

**Requested:** Fix STT 500 (`libcublas.so.12 is not found`)

**Changes:**
- Default `SttEngine` to CPU with CUDA/cuBLAS probe + retry in `server/stt.py`
- Pin `device="cpu"` in `server/app.py`
- Logged in `kiosk-voice/PROGRESS.md`

**Notes:** Restart uvicorn after pull. Optional GPU later via CUDA 12 libs + `STT_DEVICE=cuda`.

## [2026-08-09 13:35] Fix kiosk hold-to-record + Stage 1 TTS proven

**By:** @MahmoudMater

**Requested:** Continue kiosk voice pipeline after install; fix “Hold to record answer” not working

**Changes:**
- Scaffolded `kiosk-voice/` (Piper TTS, faster-whisper STT stubs, session state machine, canvas avatar lip sync)
- Proven Stage 1: CLI Piper + `POST /tts` + UI Speak page
- Fixed session mic answer to true press-and-hold with visible status/errors (`kiosk-ui/app.js`, `kiosk-ui/index.html`)
- Updated `kiosk-voice/PROGRESS.md`

**Notes:** First `/stt` call downloads Whisper `base` and can take minutes; use touch Yes/No/keypad meanwhile.
