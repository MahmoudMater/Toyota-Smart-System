# Kiosk Voice Pipeline — Phase 1 Spec (source prompt)

This file archives the Phase 1 agent prompt used to build this module.
Tracked by `PROGRESS.md`.

---

You are implementing **Phase 1 of the Toyota Smart Gate kiosk voice pipeline** —
the TTS → STT → state machine → avatar stack.

### Hard constraints

- On-prem / local only. No cloud TTS or STT APIs.
- No LLM for conversation logic — explicit state machine only.
- TTS: Piper from `OHF-Voice/piper1-gpl` / `pip install piper-tts`.
- STT: faster-whisper (`base` or `small`; `medium` only if digits fail).
- Avatar: Rive (fallback Lottie) with AnalyserNode amplitude lip sync.
- Always include non-voice fallback: touch yes/no + on-screen phone keypad.

### Build order

1. TTS only — CLI proof, then `POST /tts`, HTML test page
2. STT only — MediaRecorder upload, `POST /stt`, yes/no + digit normalize
3. State machine — session API, fake profile, retry cap → staff_escalation
4. Avatar + lip sync — Rive `mouthOpen`, idle/talking/listening

### Project structure

See README.md. Sessions use `gate_id` for future multi-gate scaling.
