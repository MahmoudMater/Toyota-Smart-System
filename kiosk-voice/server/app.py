"""FastAPI app wiring TTS, STT, and the kiosk conversation state machine."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from state_machine import SessionStore, handle_input, start_session
from stt import SttEngine
from tts import TtsEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kiosk.app")

ROOT = Path(__file__).resolve().parent.parent
UI_DIR = ROOT / "kiosk-ui"

app = FastAPI(title="Toyota Kiosk Voice", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

tts_engine = TtsEngine()
stt_engine = SttEngine(model_size="base", device="cpu")
sessions = SessionStore()


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    lang: Literal["ar", "en"] = "en"


class SessionStartRequest(BaseModel):
    gate_id: str = "gate-1"


class SessionInputRequest(BaseModel):
    source: Literal["stt", "touch"] = "touch"
    text: str | None = None
    choice: Literal["yes", "no", "ar", "en"] | None = None
    phone_digits: str | None = None
    language: Literal["ar", "en"] | None = None


@app.on_event("startup")
def _startup() -> None:
    try:
        tts_engine.load_all()
        logger.info("Piper voices: %s", tts_engine.voice_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("TTS startup issue: %s", exc)
    try:
        stt_engine.load()
        logger.info(
            "Whisper loaded: model=%s device=%s compute=%s",
            stt_engine.model_size,
            stt_engine.device,
            stt_engine.compute_type,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("STT model not ready at startup: %s", exc)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "tts_voices": tts_engine.voice_name,
        "stt_model": stt_engine.model_size,
        "stt_device": stt_engine.device,
        "default_lang": "en",
        "arabic_enabled": False,
    }


@app.post("/tts")
def tts(body: TtsRequest) -> Response:
    try:
        wav = tts_engine.synthesize_wav(body.text, lang=body.lang)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("tts_failed")
        raise HTTPException(status_code=500, detail=f"TTS failed: {exc}") from exc
    return Response(content=wav, media_type="audio/wav")


@app.post("/stt")
async def stt(
    audio: UploadFile = File(...),
    lang: str | None = Form(default=None),
) -> dict:
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio upload")
    suffix = Path(audio.filename or "clip.webm").suffix or ".webm"
    language = lang if lang in {"ar", "en"} else None
    try:
        result = stt_engine.transcribe_bytes(data, suffix=suffix, language=language)
    except Exception as exc:  # noqa: BLE001
        logger.exception("stt_failed")
        raise HTTPException(status_code=500, detail=f"STT failed: {exc}") from exc
    return result


@app.post("/session/start")
def session_start(body: SessionStartRequest | None = None) -> dict:
    gate_id = (body.gate_id if body else None) or "gate-1"
    return start_session(sessions, gate_id=gate_id)


@app.post("/session/{session_id}/input")
def session_input(session_id: str, body: SessionInputRequest) -> dict:
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    return handle_input(
        session,
        source=body.source,
        text=body.text,
        choice=body.choice,
        phone_digits=body.phone_digits,
        language=body.language,
    )


@app.get("/session/{session_id}")
def session_get(session_id: str) -> dict:
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    return session.to_public()


if UI_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(UI_DIR), html=True), name="ui")
