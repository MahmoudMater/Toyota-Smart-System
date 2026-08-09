# Toyota Smart Gate — Kiosk Voice Pipeline (Phase 1)

On-prem TTS → STT → avatar for the gate kiosk.
Conversation **session state** now lives in the NestJS `middleware/` (Socket.io + Redis).
This Python service keeps `/tts` and `/stt` only for voice; kiosk UI talks to middleware for sessions.

No cloud speech APIs, no LLM for conversation logic.

## Requirements

- Linux (dev box / LAN server)
- Python **3.12** (recommended; system 3.14 may lack wheels / venv)
- `ffmpeg` (optional, for inspecting WAV output)
- Mic + speakers for the kiosk UI

## Quick start

```bash
# From repo root
cd kiosk-voice

# Create venv with Python 3.12 (via uv)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.12
uv venv --python 3.12 .venv
source .venv/bin/activate

uv pip install -r requirements.txt

# Download Piper English voice into ./voices
python -m piper.download_voices en_US-lessac-medium --data-dir ./voices

# CLI proof (Stage 1)
python -m piper -m en_US-lessac-medium --data-dir ./voices \
  -f /tmp/kiosk-tts-proof.wav -- 'Welcome to Toyota. Please confirm your identity.'
ffprobe /tmp/kiosk-tts-proof.wav

# Run the HTTP server
cd server
uvicorn app:app --host 0.0.0.0 --port 8080 --reload
```

Open http://localhost:8080/

## Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/tts` | `{ "text": "..." }` | `audio/wav` |
| `POST` | `/stt` | multipart `audio` file | `{ text, normalized, digits }` |
| `POST` | `/session/start` | `{ "gate_id": "gate-1" }` | session + prompt |
| `POST` | `/session/{id}/input` | touch/STT input | next state + prompt |

## Multi-gate note

Phase 1 ships one physical kiosk (`gate_id` default `gate-1`). Sessions are
keyed by `session_id` so multiple gates can share one LAN server later.

## Layout

```
kiosk-voice/
  server/          FastAPI + Piper + faster-whisper + state machine
  voices/          Piper .onnx models
  kiosk-ui/        Browser kiosk / test UI
  PROGRESS.md      Stage-by-stage build log
```

## Language

**English-only for now** (`DEFAULT_LANG=en`, `ARABIC_ENABLED=False` in `server/i18n.py`).

Flow skips language selection: English greet → confirm phone → …

To re-enable Arabic later: set `ARABIC_ENABLED = True`, restore the `awaiting_language`
step in `state_machine.start_session`, uncomment Arabic voices in `tts.py`, and show the
language buttons in the UI again.

## Stage 4 avatar

Lip sync uses Web Audio `AnalyserNode` → `mouthOpen`.

- **Default:** canvas face in `kiosk-ui/avatar.js` (idle / talking / listening).
- **Optional Rive:** place `kiosk-ui/avatar.riv` with a `mouthOpen` input (and optional
  `idle` / `talking` / `listening` booleans). The UI auto-detects it; otherwise canvas stays.

## Prove session flows (Stage 3)

With the server running:

```bash
chmod +x scripts/prove_session_flow.sh
./scripts/prove_session_flow.sh http://127.0.0.1:8080
```
