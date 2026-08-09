# Releases

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
