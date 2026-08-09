# Handoff: Kiosk Voice Pipeline Phase 1 (TTS → STT → State Machine → Avatar)

## Session Metadata
- Created: 2026-08-09 15:13:47
- Project: /home/mahmoudmatter/personal-projects/tamkeen
- Branch: master
- Session duration: ~3 hours (plan → implement → language work → English-only)

### Recent Commits (for context)
  - 45e9e51 release logging
  - 147a9d9 init project presetnation and skills

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

> This is the first handoff for the kiosk-voice Phase 1 module.

## Current State Summary

Built the on-prem Toyota Smart Gate **kiosk voice pipeline** under `kiosk-voice/`: Piper TTS, faster-whisper STT (CPU), explicit conversation state machine (no LLM), kiosk HTML UI with canvas avatar + AnalyserNode lip sync, touch Yes/No + phone keypad fallbacks. Phase 1 plan stages 1–4 are implemented and largely proven. Language briefly went Arabic-default with a language picker, then user asked to **pause Arabic** — current default is **English-only** (`ARABIC_ENABLED=False`). Work left off after English-only switch; user should restart uvicorn + hard-refresh UI. Voice quality remains limited by Piper; `en_US-lessac-high.onnx` has been repeatedly corrupt/incomplete — code falls back to working `en_US-lessac-medium`.

## Codebase Understanding

### Architecture Overview

Single LAN FastAPI process serves static kiosk UI and APIs:

```
Browser (kiosk-ui) → POST /tts | /stt | /session/* → app.py
  → tts.py (Piper) + stt.py (faster-whisper CPU) + state_machine.py (per-session)
```

- Sessions keyed by `session_id` with `gate_id` (default `gate-1`) for future multi-gate.
- Fake SAB profile hardcoded — no real SAB/queue/gate hardware.
- Flow (English-only now): start → greeting+phone question → awaiting_identity_confirm → (yes→done / no→owner→phone→confirm) → done|staff_escalation.
- `awaiting_language` state still exists in the enum but is skipped while `ARABIC_ENABLED=False`.

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `kiosk-voice/server/app.py` | FastAPI: `/tts`, `/stt`, `/session/*`, static UI | Entry point; run via uvicorn from `server/` |
| `kiosk-voice/server/state_machine.py` | Conversation states + session store | Core flow; English start path |
| `kiosk-voice/server/i18n.py` | Prompt strings; `DEFAULT_LANG`, `ARABIC_ENABLED` | Flip Arabic back on here later |
| `kiosk-voice/server/tts.py` | Piper multi-voice load + SynthesisConfig | Corrupt-ONNX fallback; EN candidates only for now |
| `kiosk-voice/server/stt.py` | faster-whisper; forced CPU (no cuBLAS) | `/stt` transcription |
| `kiosk-voice/server/normalize.py` | yes/no/lang/digit normalization | STT post-process (+ Arabic helpers kept) |
| `kiosk-voice/kiosk-ui/index.html` | Kiosk test UI | Touch + sandboxes |
| `kiosk-voice/kiosk-ui/app.js` | Session UI, hold-to-record, TTS playback | Client wiring |
| `kiosk-voice/kiosk-ui/avatar.js` | Canvas lip sync; optional Rive | Stage 4 |
| `kiosk-voice/PROGRESS.md` | Stage build log | Spec-mandated history |
| `kiosk-voice/scripts/prove_session_flow.sh` | Curl text-only flow A/B/C | Regression check |
| `.cursor/plans/kiosk_voice_pipeline_aa7099c0.plan.md` | Phase 1 plan | Source of truth for scope |

### Key Patterns Discovered

- Run server from `kiosk-voice/server/` with venv activated: `uvicorn app:app --host 0.0.0.0 --port 8080`
- Python **3.12 via uv** (system 3.14 has no pip/ensurepip)
- Piper voice files need `.onnx` + `.onnx.json`; incomplete downloads → `InvalidProtobuf` — always `--force-redownload` if corrupt
- Never mix Arabic + English in one Piper utterance
- MediaRecorder: true press-and-hold via pointer events; show status for mic/STT errors
- Workspace rule: append `releases.md` after file-changing work; resolve GitHub user via `gh api user`
- Do not edit the plan file unless user asks

## Work Completed

### Tasks Finished

- [x] Scaffold `kiosk-voice/` (server, voices, kiosk-ui, PROGRESS, README, requirements)
- [x] Stage 1: Piper CLI proof + `POST /tts` + Speak sandbox
- [x] Stage 2: faster-whisper `POST /stt`, normalize yes/no/digits, MediaRecorder upload
- [x] Stage 3: per-session state machine + `/session` APIs + touch keypad + curl prove script
- [x] Stage 4: canvas avatar mouthOpen + AnalyserNode lip sync + state labels (Rive optional via `avatar.riv`)
- [x] Fix hold-to-record UX + STT CPU fallback (missing `libcublas.so.12`)
- [x] Greeting copy: vehicle statement + phone-only question
- [x] Arabic default + language picker (then paused)
- [x] TTS quality tuning + corrupt-voice fallback
- [x] Switch to English-only; disable Arabic for now

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `kiosk-voice/server/*.py` | Full voice pipeline server | Phase 1 implementation |
| `kiosk-voice/kiosk-ui/*` | Kiosk UI + avatar + hold-to-record | Browser demo |
| `kiosk-voice/PROGRESS.md` | Append-only stage log | Spec requirement |
| `kiosk-voice/README.md` | Runbook + English-only notes | Operator docs |
| `kiosk-voice/scripts/prove_session_flow.sh` | Curl A/B/C flows | Text-only proof |
| `releases.md` | Changelog entries | Workspace release-logging rule |
| `.cursor/plans/kiosk_voice_pipeline_aa7099c0.plan.md` | Phase 1 plan (do not rewrite casually) | Planning |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Python 3.12 + uv venv | System 3.14 | 3.14 lacks ensurepip/pip |
| FastAPI + Piper + faster-whisper | NestJS later for middleware | Spec: on-prem Piper/whisper; native Python |
| STT on CPU only | CUDA auto | GPU visible but `libcublas.so.12` missing → 500s |
| Canvas avatar as Rive fallback | Require custom `.riv` | No mouthOpen asset; canvas satisfies lip-sync contract |
| English-only now | Keep Arabic picker | User request; Arabic strings/voices kept for later |
| Prefer lessac-high, fall back to medium | medium only | high often corrupt download; fallback prevents TTS 500 |

## Pending Work

## Immediate Next Steps

1. Restart uvicorn from `kiosk-voice/server/` with `.venv` so English-only + TTS fallback code is loaded; hard-refresh browser (`Ctrl+Shift+R`).
2. Smoke-test: Start visit → Yes → gate_open_stub; then wrong-number path with keypad; optional hold-to-record “yes”.
3. Optionally delete corrupt `voices/en_US-lessac-high.onnx*` (often incomplete) or force-redownload; medium works today.
4. Run `./scripts/prove_session_flow.sh http://127.0.0.1:8080` against live server after restart.

### Blockers/Open Questions

- [ ] Blocker: Incomplete CUDA toolkit (`libcublas`) — Needs: CUDA 12 libs + `STT_DEVICE=cuda` / `STT_ALLOW_CUDA=1` if GPU STT desired
- [ ] Question: When to re-enable Arabic — Suggested: set `ARABIC_ENABLED=True`, restore language step in `start_session`, uncomment AR voices in `tts.py`, show `#langButtons`
- [ ] Question: Custom Rive `.riv` with `mouthOpen` — Suggested: drop at `kiosk-ui/avatar.riv` when design has asset

### Deferred Items

- SAB/SAP lookup, queue engine, gate controller, MQTT/WebSocket middleware (out of Phase 1)
- Streaming STT
- LLM conversation brain (explicitly forbidden)
- Cloud TTS/STT
- Better Arabic TTS than Piper kareem-medium (e.g. Coqui/XTTS) — quality ceiling issue
- Multi-gate runtime (only `gate_id` scaffolding exists)

## Important Context

1. **Module root is `kiosk-voice/`**, not repo root presentation. Empty `tts/` folder at repo root is unused — leave alone.
2. **English-only**: `kiosk-voice/server/i18n.py` has `DEFAULT_LANG = "en"` and `ARABIC_ENABLED = False`. Start flow goes straight to phone confirm in English.
3. **Do not use cloud speech or LLMs** for this module.
4. **Voice files are gitignored** (`voices/*.onnx`). Working English voice: `en_US-lessac-medium` (~61MB). `en_US-lessac-high` has been corrupt multiple times — `tts.py` skips unloadable ONNX and tries next candidate.
5. **Arabic voice `ar_JO-kareem-medium` is on disk** but not loaded while AR disabled.
6. **User often runs installs themselves**; prefer instructions over long background downloads when they ask.
7. **PROGRESS.md** must be updated for meaningful work; **releases.md** at repo root too (GitHub user `@MahmoudMater`).
8. Plan file: `.cursor/plans/kiosk_voice_pipeline_aa7099c0.plan.md` — user previously said not to edit the plan during execution.

## Context for Resuming Agent

### Assumptions Made

- Single physical gate for now; `gate_id` reserved for scale-out.
- Fake profile `Ahmed Hassan` / `0501234567` / `ABC 1234` is fine until SAB exists.
- Touch fallbacks are acceptable when STT is slow/wrong.
- Piper quality is “good enough” for Phase 1 English demo after tuning.

### Potential Gotchas

- Running `uvicorn` from wrong directory → `Could not import module "app"` — must `cd kiosk-voice/server`.
- Browser caches `app.js`/`avatar.js` with 304 — hard-refresh required after UI changes.
- First `/stt` after cold start loads Whisper `base` (slow); subsequent calls faster.
- `createMediaElementSource` only once per `<audio>` — avatar.js reuses graph.
- Piper `InvalidProtobuf` = incomplete download, not a code bug.
- Saying “no” twice (identity then not owner) → `staff_escalation`.
- Phone confirm question must remain statement+phone Q only — do not revive “is this you?”.
- Optional Rive file `kiosk-ui/avatar.riv` is not present yet (404 expected); canvas avatar is the fallback.

## Environment State

### Tools/Services Used

- uv + Python 3.12.13 venv at `kiosk-voice/.venv`
- piper-tts, faster-whisper, fastapi, uvicorn
- ffmpeg/ffprobe for WAV checks
- Piper voices in `kiosk-voice/voices/`

### Active Processes

- User may have uvicorn on `:8080` — restart after pulling these changes
- No agent-owned background server assumed at handoff time

### Environment Variables

- `STT_DEVICE` (optional; default cpu in app)
- `STT_ALLOW_CUDA` / `STT_COMPUTE_TYPE` (optional)
- `TTS_LENGTH_SCALE` / `TTS_NOISE_SCALE` / `TTS_NOISE_W_SCALE` / `TTS_VOLUME` (optional synthesis tuning)

## Related Resources

- Design: `toyota-gate-queue-system-design.md`
- Plan: `.cursor/plans/kiosk_voice_pipeline_aa7099c0.plan.md`
- Build log: `kiosk-voice/PROGRESS.md`
- Spec archive: `kiosk-voice/cursor-agent-prompt.md`
- Prove script: `kiosk-voice/scripts/prove_session_flow.sh`
- Changelog: `releases.md`
- Piper voices: `python -m piper.download_voices` / Hugging Face `rhasspy/piper-voices`

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
