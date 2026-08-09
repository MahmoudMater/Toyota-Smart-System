"""Normalize STT transcripts for yes/no, language choice, and phone digits."""

from __future__ import annotations

import re
import unicodedata

YES_WORDS = frozenset(
    {
        "yes",
        "yeah",
        "yep",
        "yup",
        "ya",
        "yea",
        "sure",
        "correct",
        "affirmative",
        "ok",
        "okay",
        "right",
        "true",
        # Arabic
        "نعم",
        "ايوه",
        "أيوه",
        "ايوة",
        "أيوة",
        "اه",
        "آه",
        "صح",
        "موافق",
        "تمام",
    }
)

NO_WORDS = frozenset(
    {
        "no",
        "nope",
        "nah",
        "naw",
        "negative",
        "incorrect",
        "wrong",
        "false",
        # Arabic
        "لا",
        "لأ",
        "لاء",
        "مش",
        "مو",
    }
)

AR_LANG_WORDS = frozenset(
    {
        "arabic",
        "arab",
        "ar",
        "عربي",
        "عربى",
        "العربية",
        "العربيه",
        "عربية",
        "عربيه",
        "بالعربي",
        "بالعربية",
    }
)

EN_LANG_WORDS = frozenset(
    {
        "english",
        "englisch",
        "en",
        "انجليزي",
        "إنجليزي",
        "انجليزية",
        "إنجليزية",
        "الانجليزي",
        "الإنجليزي",
        "الانجليزية",
        "الإنجليزية",
        "بالانجليزي",
        "بالإنجليزي",
    }
)

WORD_NUMBERS = {
    "zero": "0",
    "oh": "0",
    "o": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    # Arabic (common forms)
    "صفر": "0",
    "واحد": "1",
    "اثنين": "2",
    "اتنين": "2",
    "ثنين": "2",
    "ثلاثة": "3",
    "ثلاثه": "3",
    "تلاتة": "3",
    "تلاته": "3",
    "اربعة": "4",
    "أربعة": "4",
    "اربعه": "4",
    "أربعه": "4",
    "اربعة": "4",
    "خمسة": "5",
    "خمسه": "5",
    "ستة": "6",
    "سته": "6",
    "سبعة": "7",
    "سبعه": "7",
    "ثمانية": "8",
    "ثمانيه": "8",
    "تمانية": "8",
    "تسعة": "9",
    "تسعه": "9",
}

# Eastern Arabic-Indic digits → ASCII
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = text.translate(_ARABIC_INDIC)
    return text.strip()


def _tokenize(text: str) -> list[str]:
    cleaned = re.sub(r"[^\w\s]", " ", _fold(text).lower(), flags=re.UNICODE)
    return [t for t in cleaned.split() if t]


def extract_digits(text: str) -> str:
    """Pull a digit string from spoken/typed input (latin/arabic digits + word numbers)."""
    digits: list[str] = []
    for token in _tokenize(text):
        if token.isdigit():
            digits.extend(list(token))
            continue
        mapped = WORD_NUMBERS.get(token)
        if mapped is not None:
            digits.append(mapped)
            continue
        embedded = re.findall(r"\d", token)
        digits.extend(embedded)
    return "".join(digits)


def normalize_yes_no(text: str) -> str | None:
    tokens = _tokenize(text)
    raw = _fold(text)
    if not tokens and not raw:
        return None

    joined = " ".join(tokens)
    if joined in YES_WORDS or raw in YES_WORDS:
        return "yes"
    if joined in NO_WORDS or raw in NO_WORDS:
        return "no"

    has_yes = any(t in YES_WORDS for t in tokens) or any(
        w in raw for w in ("نعم", "أيوه", "ايوه", "أيوة", "ايوة", "آه", "اه", "صح", "تمام")
    )
    has_no = any(t in NO_WORDS for t in tokens) or any(
        w in raw for w in ("لا", "لأ", "لاء")
    )
    # Latin short words from the set
    has_yes = has_yes or any(t in YES_WORDS for t in tokens)
    has_no = has_no or any(t in NO_WORDS for t in tokens)

    if has_yes and not has_no:
        return "yes"
    if has_no and not has_yes:
        return "no"
    return None


def normalize_language(text: str) -> str | None:
    """Map spoken/typed language choice → 'ar' | 'en'."""
    raw = _fold(text)
    lower = raw.lower()
    tokens = _tokenize(text)

    hit_ar = any(t in AR_LANG_WORDS for t in tokens) or any(
        w in raw or w in lower for w in AR_LANG_WORDS
    )
    hit_en = any(t in EN_LANG_WORDS for t in tokens) or any(
        w in raw or w in lower for w in EN_LANG_WORDS
    )

    if hit_ar and not hit_en:
        return "ar"
    if hit_en and not hit_ar:
        return "en"
    # Prefer explicit whole-utterance
    if lower.strip() in AR_LANG_WORDS:
        return "ar"
    if lower.strip() in EN_LANG_WORDS:
        return "en"
    return None


def normalize_transcript(text: str) -> dict:
    """
    Return structured normalization:
      { text, normalized: 'yes'|'no'|'ar'|'en'|'digits'|None, digits: str|None }
    """
    raw = _fold(text)
    lang = normalize_language(raw)
    if lang is not None:
        return {"text": raw, "normalized": lang, "digits": None}

    yes_no = normalize_yes_no(raw)
    digits = extract_digits(raw)
    if yes_no is not None:
        return {"text": raw, "normalized": yes_no, "digits": digits or None}
    if digits:
        return {"text": raw, "normalized": "digits", "digits": digits}
    return {"text": raw, "normalized": None, "digits": None}
