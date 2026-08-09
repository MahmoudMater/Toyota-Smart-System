# Kiosk Voice Pipeline — Build Log

Tracks implementation of Phase 1 (TTS → STT → state machine → avatar) for the
Toyota Smart Gate kiosk. On-prem only, no LLM, no cloud TTS/STT.
See /cursor-agent-prompt.md for the full spec this log tracks against.

| Stage | Status |
|---|---|
| 1. TTS | ✅ Done |
| 2. STT | ✅ Done |
| 3. State machine | ✅ Done |
| 4. Avatar | ✅ Done (canvas lip sync; Rive optional) |







## [i18n] English-only default; Arabic paused
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Default lang `en`; `ARABIC_ENABLED=False`
- Removed language-selection turn from active flow
- UI language buttons hidden

**How it was tested:**
- Unit: start_session → awaiting_identity_confirm, English prompt

**Decisions / deviations:**
- Arabic strings/voices kept in codebase for later re-enable

**Open issues / TODO:**
- Restart uvicorn + hard-refresh UI

## [TTS] Quality tuning
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- English voice preference: lessac-high; synthesis length_scale=1.2, lower noise
- Removed mixed AR/EN from language ask (kills Piper quality)
- Phone numbers spoken as digit words

**How it was tested:**
- Code change; user should download lessac-high and restart uvicorn

**Decisions / deviations:**
- Piper has no Arabic "high" voice — kareem-medium is the best on-prem Piper option

**Open issues / TODO:**
- `python -m piper.download_voices en_US-lessac-high --data-dir ./voices`

## [Feature] Arabic default + language selection after greeting
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Added `awaiting_language` state; default `lang=ar`
- `server/i18n.py` bilingual prompts; Arabic yes/no + language normalize in `normalize.py`
- Dual Piper voices in `tts.py` (`ar_JO-kareem-medium` + English); `/tts` accepts `lang`
- `/stt` optional `lang` form field; UI عربي/English buttons + RTL
- Updated prove script for language flows

**How it was tested:**
- Unit tests: normalize عربي/english + state machine language → phone → done
- User must download Arabic voice + restart uvicorn for live TTS in Arabic

**Decisions / deviations:**
- Language ask is bilingual; TTS for that turn uses Arabic voice
- If Arabic voice missing, TTS falls back to English voice with a warning

**Open issues / TODO:**
- Download: `python -m piper.download_voices ar_JO-kareem-medium --data-dir ./voices`
- Restart uvicorn + hard-refresh UI

## [Phase 1] Plan gap fill — prove flows + STT preload + avatar contract
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Audited plan vs code: Stage 1–4 present; gaps were startup STT preload, curl proof script, avatar state wiring
- `app.py` loads Whisper at startup (CPU)
- Added `scripts/prove_session_flow.sh` — Flows A/B/C all pass against live server
- STT curl `/stt` with Piper "yes" → `normalized: yes`
- Avatar: canvas `mouthOpen` + idle/talking/listening labels; optional `kiosk-ui/avatar.riv` auto-detect; session `avatar_state` wired in UI
- README Stage 4 + prove script docs

**How it was tested:**
- `./scripts/prove_session_flow.sh http://127.0.0.1:8080` → ALL SESSION FLOWS PASSED
- `POST /stt` with `/tmp/stt-yes.wav` → `{"text":"Yes.","normalized":"yes",...}`
- Health shows `stt_device: cpu`

**Decisions / deviations:**
- No custom `.riv` asset yet — canvas implements the Stage 4 lip-sync contract; drop `avatar.riv` later for Rive
- CUDA disabled (missing libcublas) — CPU Whisper `base` as planned fallback

**Open issues / TODO:**
- Restart uvicorn to pick up STT-at-startup change
- Optional: author/drop `kiosk-ui/avatar.riv` with `mouthOpen`

## [Stage 3] Greeting: statement + phone-only question
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Reworded `start_session` prompt so vehicle/profile is a statement; only asks "Is this your phone number?"
- Cleaned duplicate owner-check prompt on "no"
- File: `server/state_machine.py`

**How it was tested:**
- Prompt text updated; restart uvicorn / new Start visit to hear new wording

**Decisions / deviations:**
- Matches design intent: confirm phone on file, not "is this you"

**Open issues / TODO:**
- None for this copy change

## [Stage 2] Force STT onto CPU (fix cuBLAS crash)
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- `stt.py` defaults to CPU; probes cuBLAS before allowing CUDA; retries on CPU if CUDA encode fails
- `app.py` constructs `SttEngine(..., device="cpu")`
- Root cause: `RuntimeError: Library libcublas.so.12 is not found`

**How it was tested:**
- Fix applied after server log showed STT 500 with missing libcublas; restart uvicorn required to pick up change

**Decisions / deviations:**
- Prefer reliable CPU `base` model over broken partial CUDA stack for Phase 1

**Open issues / TODO:**
- Optional later: install CUDA 12 + set `STT_DEVICE=cuda` / `STT_ALLOW_CUDA=1`

## [Stage 2] Fix hold-to-record mic answer button
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Replaced click-toggle recorder with real press-and-hold (`pointerdown` / `pointerup`)
- Added mic permission / empty-clip / STT error messages in `recordStatus`
- Prefer supported MediaRecorder mime types; timeslice chunks so short holds still capture audio
- Touched `kiosk-ui/app.js`, `kiosk-ui/index.html`

**How it was tested:**
- Code fix after user report; user should hard-refresh UI and hold the button while speaking
- Server log previously showed no `/stt` from that button (silent mic fail or unclear UX)

**Decisions / deviations:**
- Canvas avatar used until a custom `.riv` is added; Rive runtime still loaded for optional swap

**Open issues / TODO:**
- Confirm Whisper `base` first download completes; then verify `/stt` end-to-end
- Prefetch: `python -c "from faster_whisper import WhisperModel; WhisperModel('base')"`

## [Stage 1] Piper CLI + POST /tts + HTML page
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Python 3.12 venv via `uv`; `piper-tts` + FastAPI stack
- Voice `en_US-lessac-medium` (+ `.onnx.json`) in `voices/`
- CLI proof WAV; `server/tts.py` + `POST /tts`; kiosk UI Speak sandbox

**How it was tested:**
- `python -m piper ... -f /tmp/kiosk-tts-proof.wav` → ffprobe OK (22050 Hz PCM)
- `POST /tts` → playable WAV; browser UI served on `:8080`

**Decisions / deviations:**
- Python 3.12 instead of system 3.14 (no pip/ensurepip on 3.14)

**Open issues / TODO:**
- None for Stage 1

## [Stage 1] Scaffold project tree + docs
**Date:** 2026-08-09
**Status:** ✅ Done

**What was done:**
- Created `kiosk-voice/` layout (`server/`, `voices/`, `kiosk-ui/`)
- Started `PROGRESS.md`, README, requirements, and Stage 1 server/UI stubs

**How it was tested:**
- Layout present; later validated with Piper install

**Decisions / deviations:**
- Use Python 3.12 via `uv` instead of system 3.14

**Open issues / TODO:**
- (resolved in later entries)
