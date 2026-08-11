# Releases

## [2026-08-11 16:34] Fix avatar-agent ElevenLabs WS 403 (eleven_v3)

**By:** @MahmoudMater

**Requested:** Avatar-agent fails TTS with `could not connect to ElevenLabs` / WebSocket 403.

**Changes:**
- Confirmed HTTP `/tts` with `eleven_v3` works; LiveKit plugin WS `multi-stream-input` returns 403 for `eleven_v3` only
- Avatar-agent now uses `ELEVENLABS_AVATAR_TTS_MODEL_ID` (default `eleven_flash_v2_5`) and falls back if `eleven_v3` is set
- Strips v3 audio tags before `session.say`; documented in `.env.example` + README

**Notes:** Nest can keep `ELEVENLABS_TTS_MODEL_ID=eleven_v3`. Restart `npm run avatar-agent:dev` after the change.

## [2026-08-11 16:32] Fix false “livekit disconnected” status

**By:** @MahmoudMater

**Requested:** Why does the console show “livekit disconnected”?

**Changes:**
- Explained: LiveKit Cloud still had rooms with `bey-avatar-agent` + video/audio tracks; the UI label was wrong
- Hardened `middleware/public/bey-room.js` so intentional reconnects / superseded rooms no longer overwrite status or clear the new video

**Notes:** Hard-refresh console.html after pull. Disconnect reason is shown if the server really drops the browser.

## [2026-08-11 16:27] Fix ServeStatic exclude + public path (console 500)

**By:** @MahmoudMater

**Requested:** console.html / favicon returning 500 (`pathToRegexpError` on `/health(.*)`).

**Changes:**
- Updated `ServeStaticModule` excludes to path-to-regexp v8 syntax (`/health/{*any}`, etc.) in `middleware/src/app.module.ts`
- Pointed static `rootPath` at `join(process.cwd(), 'public')` (nest emits to `dist/src/`)
- Added `middleware/public/favicon.ico` so browser icon requests stop 500-ing

**Notes:** Verified `/console.html` and `/favicon.ico` return 200; `/health` shows `bey_enabled: true`.

## [2026-08-11 16:23] Enable BEY avatar with LiveKit Cloud keys

**By:** @MahmoudMater

**Requested:** Paste LiveKit URL/key/secret and enable Beyond Presence.

**Changes:**
- Set `AVATAR_ADAPTER=bey` and LiveKit credentials in `middleware/.env`
- Started Nest + `avatar-agent` worker; agent registered as `tamkeen-avatar` on LiveKit Cloud (EU West)

**Notes:** Secrets live only in `.env` (not committed). Rotate if this chat is shared.

## [2026-08-11 16:18] Beyond Presence speech-to-video via LiveKit

**By:** @MahmoudMater

**Requested:** Integrate Beyond Presence avatars with Speech-to-video + LiveKit (keep ElevenLabs, replace only the face).

**Changes:**
- Env: `AVATAR_ADAPTER`, `LIVEKIT_*`, `BEY_*` in `env.validation.ts` / `.env.example`; Nest `LiveKitModule` (room, agent dispatch, `kiosk.speak`, `/avatar/*`)
- New `middleware/avatar-agent` worker (`@livekit/agents` + bey + elevenlabs); speaker-only on data packets; default Nelly avatar
- Console/kiosk UI: LiveKit video mount + canvas fallback; README runbook

**Notes:** Leave `AVATAR_ADAPTER=canvas` until LiveKit Cloud + BEY API keys are set, then `npm run avatar-agent:dev` alongside Nest.

## [2026-08-11 15:46] Retry ElevenLabs 429 system_busy

**By:** @MahmoudMater

**Requested:** Why TTS 503 / ElevenLabs 429 system_busy after upgrading plan.

**Changes:**
- Explained: `system_busy` is ElevenLabs capacity (esp. `eleven_v3`), not a broken middleware URL
- Added up to 4 attempts with exponential backoff on 429/5xx in `middleware/src/modules/speech/elevenlabs.client.ts`

**Notes:** Live probe after the error returned HTTP 200 + MP3 (~37KB). Redis TTS cache will avoid repeat calls for identical prompts.

## [2026-08-11 14:07] Fix silent visit TTS + ElevenLabs call tracing

**By:** @MahmoudMater

**Requested:** Why no voice during visit session; keep track of ElevenLabs calls.

**Changes:**
- Root cause: `TTS_ADAPTER=stub` in `middleware/.env` returned silent WAV; switched to `elevenlabs` (and STT)
- Info-level call tracing: `tts.synthesize.start` → `tts.elevenlabs.call` → `elevenlabs.request/response|error` in `tts.service.ts`, `elevenlabs-tts.adapter.ts`, `elevenlabs.client.ts`
- `mw-api.js` / `console.js` now use TTS response `content-type`; UI surfaces TTS errors instead of failing silently

**Notes:** Live call returns ElevenLabs **402 paid_plan_required** for voice `2bnoa3wtrtcUW41TrSJM` (library voices blocked on free API). Upgrade plan or set `ELEVENLABS_TTS_VOICE_ID` to a voice your key can use.

## [2026-08-11 14:01] TTS prompts rewritten for ElevenLabs v3

**By:** @MahmoudMater

**Requested:** Rewrite TTS messages like the Arabic examples (tashkeel, audio tags, pauses) using ElevenLabs v3 best practices.

**Changes:**
- Split kiosk copy into `display` + `speech` via `Prompt` in `middleware/src/modules/kiosk/i18n.ts` (Al-Sayer Hayyak brand, EN/AR tags + Arabic tashkeel, 3-3-4 digit read-out)
- Wired `lastPromptSpeech` / `PublicSession.speech` through `state-machine.ts`; `app.js` / `console.js` speak `speech` and show clean `prompt`
- Default `ELEVENLABS_TTS_MODEL_ID` → `eleven_v3` in `env.validation.ts` and `.env.example`

**Notes:** Screen never shows tags or tashkeel. Audio tags require v3 — multilingual_v2 would read brackets aloud.

## [2026-08-11 13:27] NLU latency-first for realtime sockets

**By:** @MahmoudMater

**Requested:** Don't need 100% extraction accuracy (confirm step exists); must be fast for Socket.io realtime.

**Changes:**
- Hybrid fast path in `nlu.service.ts`: rules for yes/no + clean phones; LLM only for messy digit speech; 2s fail-fast timeout
- Default model `qwen3:0.6b`, `NLU_TIMEOUT_MS=2000`; slimmed prompt for lower prefill
- Updated `docs/nlu-sizing.md` for latency-first product constraints

**Notes:** Confirm read-back remains the accuracy safety net. GPU still preferred if messy-phone LLM turns must stay under ~500ms.

## [2026-08-11 13:25] NLU bake-off results + VPS sizing doc

**By:** @MahmoudMater

**Requested:** Finish benchmark analysis and cost/sizing plan after Ollama runs.

**Changes:**
- Chose `qwen3:1.7b` (54% vs rules 43%; `0.6b` at 27% rejected); wrote `middleware/docs/nlu-sizing.md`
- Strengthened fallback in `nlu.service.ts` when LLM digits fail EG/SA validation; added CC few-shots to `prompt.ts`
- Fixed a few ambiguous fixtures; refreshed `scripts/nlu-fixtures.json`

**Notes:** Key self-correction case passed on both models. CPU 4-thread p50 ~6s for 1.7B — GPU recommended for interactive kiosk.

## [2026-08-11 13:15] Fix Qwen3 empty NLU responses (disable thinking)

**By:** @MahmoudMater

**Requested:** Benchmark failed with Unparseable/empty content and timeouts on qwen3:0.6b / 1.7b.

**Changes:**
- Benchmark now uses Ollama native `/api/chat` with `think: false` + `format: json` (OpenAI `/v1` ignores think and burns tokens on thinking)
- `llm-nlu.adapter.ts` prefers native Ollama path when `NLU_BASE_URL` ends in `/v1`; OpenAI-compat sends `think` / `reasoning_effort` / `/no_think`
- Default `NLU_TIMEOUT_MS` raised to 5000; benchmark default timeout 120s

**Notes:** Re-run benchmark after Ctrl+C of the hung run. Set thread caps on `ollama serve`, not the node client.

## [2026-08-11 12:47] Local LLM NLU module for STT transcript extraction

**By:** @MahmoudMater

**Requested:** Dig into Hugging Face / local LLM to extract phone digits and yes/no from messy STT transcripts (self-corrections, filler, Arabic).

**Changes:**
- Added `middleware/src/modules/nlu/` — port/adapter seam (`rules` default, `llm` via OpenAI-compatible HTTP), EG/SA phone validation, prompt + few-shots, eval corpus (37 fixtures)
- Wired `NluService` into `SttService`; env: `NLU_*`, `PHONE_REGIONS` in `env.validation.ts` and `.env.example`
- Rules baseline on corpus: **43.2%** (documents why LLM is needed)
- Added `middleware/scripts/nlu-benchmark.mjs` + `nlu-fixtures.json` for 0.6B vs 1.7B bake-off

**Notes:** Benchmark/sizing doc still pending user-run of Ollama pulls + script. Default remains `NLU_ADAPTER=rules` until switched on.

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
