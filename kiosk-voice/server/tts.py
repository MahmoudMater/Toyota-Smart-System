"""Piper TTS wrapper — synthesize text to WAV bytes (Arabic + English voices)."""

from __future__ import annotations

import io
import logging
import os
import wave
from pathlib import Path

from piper import PiperVoice
from piper.config import SynthesisConfig

logger = logging.getLogger("kiosk.tts")

DEFAULT_VOICES_DIR = Path(__file__).resolve().parent.parent / "voices"

# English-only for now; Arabic candidates stay listed for later re-enable.
VOICE_CANDIDATES = {
    "en": ["en_US-lessac-high", "en_US-lessac-medium", "en_US-amy-medium"],
    # "ar": ["ar_JO-kareem-medium", "ar_JO-kareem-low"],  # re-enable with ARABIC_ENABLED
}

# Clearer, slightly slower speech — helps kiosk intelligibility.
DEFAULT_SYN = SynthesisConfig(
    length_scale=float(os.environ.get("TTS_LENGTH_SCALE", "1.2")),
    noise_scale=float(os.environ.get("TTS_NOISE_SCALE", "0.5")),
    noise_w_scale=float(os.environ.get("TTS_NOISE_W_SCALE", "0.6")),
    normalize_audio=True,
    volume=float(os.environ.get("TTS_VOLUME", "1.0")),
)


class TtsEngine:
    def __init__(self, voices_dir: Path | None = None) -> None:
        self.voices_dir = Path(voices_dir or DEFAULT_VOICES_DIR)
        self._voices: dict[str, PiperVoice] = {}
        self._resolved: dict[str, str] = {}
        self._bad_models: set[str] = set()

    def _model_path(self, voice_name: str) -> Path | None:
        if voice_name in self._bad_models:
            return None
        onnx = self.voices_dir / f"{voice_name}.onnx"
        if onnx.is_file():
            return onnx
        nested = self.voices_dir / voice_name / f"{voice_name}.onnx"
        if nested.is_file():
            return nested
        return None

    def _try_load_named(self, voice_name: str) -> PiperVoice | None:
        if voice_name in self._voices:
            return self._voices[voice_name]
        model = self._model_path(voice_name)
        if model is None:
            return None
        # Incomplete downloads are common — reject tiny/partial files early.
        size = model.stat().st_size
        if size < 5_000_000:
            logger.warning("Skipping tiny/corrupt voice file %s (%s bytes)", model, size)
            self._bad_models.add(voice_name)
            return None
        try:
            voice = PiperVoice.load(str(model))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to load %s (%s). Will try next candidate. "
                "Re-download with: python -m piper.download_voices %s --data-dir %s --force-redownload",
                voice_name,
                exc,
                voice_name,
                self.voices_dir,
            )
            self._bad_models.add(voice_name)
            return None
        self._voices[voice_name] = voice
        logger.info("Loaded Piper voice %s", voice_name)
        return voice

    def load(self, lang: str = "en") -> None:
        if lang in self._resolved and self._resolved[lang] in self._voices:
            return
        last_error = None
        for name in VOICE_CANDIDATES.get(lang, VOICE_CANDIDATES["en"]):
            voice = self._try_load_named(name)
            if voice is not None:
                self._resolved[lang] = name
                return
            last_error = name
        wanted = ", ".join(VOICE_CANDIDATES.get(lang, []))
        raise FileNotFoundError(
            f"No usable Piper voice for lang={lang} (last tried {last_error}). "
            f"Download one of: {wanted} into {self.voices_dir}"
        )

    def load_all(self) -> None:
        for lang in VOICE_CANDIDATES:
            try:
                self.load(lang)
            except FileNotFoundError as exc:
                logger.warning("Voice for %s not ready: %s", lang, exc)

    def _voice_for(self, lang: str) -> PiperVoice:
        lang = lang if lang in VOICE_CANDIDATES else "en"
        try:
            self.load(lang)
        except FileNotFoundError:
            if lang != "en":
                logger.warning("Falling back to English TTS; missing Arabic voice")
                self.load("en")
                lang = "en"
            else:
                raise
        voice_name = self._resolved[lang]
        return self._voices[voice_name]

    @property
    def voice_name(self) -> str:
        parts = []
        for lang in VOICE_CANDIDATES:
            parts.append(self._resolved.get(lang, f"{lang}:missing"))
        return ",".join(parts)

    def synthesize_wav(self, text: str, lang: str = "en") -> bytes:
        text = (text or "").strip()
        if not text:
            raise ValueError("text must be non-empty")
        voice = self._voice_for(lang)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file, syn_config=DEFAULT_SYN)
        return buf.getvalue()
