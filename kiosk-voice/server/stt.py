"""faster-whisper STT wrapper — file upload transcription (non-streaming)."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel

from normalize import normalize_transcript

logger = logging.getLogger("kiosk.stt")


def _cuda_runtime_usable() -> bool:
    """ctranslate2 may report GPUs even when cuBLAS is missing — probe carefully."""
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() <= 0:
            return False
        # Loading a tiny CUDA model fails fast if libcublas is absent.
        # Prefer an env override rather than a heavy probe: check common lib paths.
        import ctypes.util

        if ctypes.util.find_library("cublas") or ctypes.util.find_library("cublasLt"):
            return True
        # Also accept explicit opt-in when the user knows CUDA works
        return os.environ.get("STT_ALLOW_CUDA", "").lower() in {"1", "true", "yes"}
    except Exception:
        return False


class SttEngine:
    def __init__(
        self,
        model_size: str = "base",
        device: str | None = None,
        compute_type: str | None = None,
    ) -> None:
        # Default CPU: this machine's CUDA stack is incomplete (no libcublas.so.12).
        env_device = os.environ.get("STT_DEVICE", "").strip().lower()
        self.model_size = model_size
        self.device = (device or env_device or "cpu").lower()
        if self.device == "auto":
            self.device = "cuda" if _cuda_runtime_usable() else "cpu"
        self.compute_type = (compute_type or os.environ.get("STT_COMPUTE_TYPE") or "auto").lower()
        self._model: WhisperModel | None = None

    def _resolve_compute(self, device: str, compute_type: str) -> str:
        if compute_type != "auto":
            return compute_type
        return "float16" if device == "cuda" else "int8"

    def load(self, force: bool = False) -> None:
        if self._model is not None and not force:
            return
        device = self.device
        if device == "cuda" and not _cuda_runtime_usable():
            logger.warning(
                "CUDA requested but cuBLAS not usable; falling back to CPU. "
                "Install CUDA 12 libs or set STT_DEVICE=cpu."
            )
            device = "cpu"
        compute_type = self._resolve_compute(device, self.compute_type)
        logger.info(
            "Loading Whisper model=%s device=%s compute_type=%s",
            self.model_size,
            device,
            compute_type,
        )
        self._model = WhisperModel(
            self.model_size,
            device=device,
            compute_type=compute_type,
        )
        self.device = device
        self.compute_type = compute_type

    @property
    def model(self) -> WhisperModel:
        self.load()
        assert self._model is not None
        return self._model

    def transcribe_bytes(
        self,
        audio_bytes: bytes,
        suffix: str = ".webm",
        language: str | None = None,
    ) -> dict:
        if not audio_bytes:
            raise ValueError("audio is empty")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()
            return self.transcribe_path(Path(tmp.name), language=language)

    def transcribe_path(self, path: Path, language: str | None = None) -> dict:
        try:
            return self._transcribe_once(path, language=language)
        except RuntimeError as exc:
            msg = str(exc).lower()
            if self.device == "cuda" and (
                "cublas" in msg or "cuda" in msg or "cudnn" in msg
            ):
                logger.warning("CUDA STT failed (%s); reloading on CPU and retrying", exc)
                self.device = "cpu"
                self.compute_type = "int8"
                self.load(force=True)
                return self._transcribe_once(path, language=language)
            raise

    def _transcribe_once(self, path: Path, language: str | None = None) -> dict:
        # language: "ar" | "en" | None (auto — useful for language-selection turn)
        whisper_lang = None
        if language == "ar":
            whisper_lang = "ar"
        elif language == "en":
            whisper_lang = "en"

        segments, _info = self.model.transcribe(
            str(path),
            language=whisper_lang,
            vad_filter=True,
        )
        texts = [seg.text.strip() for seg in segments]
        text = " ".join(t for t in texts if t).strip()
        return normalize_transcript(text)
