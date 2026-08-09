"""UI / TTS prompt strings for Arabic (default) and English."""

from __future__ import annotations

DEFAULT_LANG = "en"
# Set True later to re-enable Arabic + language selection after greeting.
ARABIC_ENABLED = False
SUPPORTED = frozenset({"en", "ar"}) if ARABIC_ENABLED else frozenset({"en"})

_AR_DIGIT_WORDS = {
    "0": "صفر",
    "1": "واحد",
    "2": "اثنين",
    "3": "ثلاثة",
    "4": "أربعة",
    "5": "خمسة",
    "6": "ستة",
    "7": "سبعة",
    "8": "ثمانية",
    "9": "تسعة",
}

_EN_DIGIT_WORDS = {
    "0": "zero",
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
}


def _speak_phone(phone: str, lang: str = "en") -> str:
    """Speak phone as digit words (much clearer than raw '0 5 0 …' for Piper)."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if not digits:
        return phone or ""
    table = _AR_DIGIT_WORDS if lang == "ar" else _EN_DIGIT_WORDS
    return "، ".join(table[d] for d in digits) if lang == "ar" else ", ".join(table[d] for d in digits)


def greeting(lang: str, name: str, plate: str) -> str:
    if lang == "en":
        return (
            f"Welcome to Toyota. Hello {name}. "
            f"We found vehicle {plate} on file."
        )
    return (
        f"مرحباً بك في تويوتا. أهلاً {name}. "
        f"وجدنا المركبة {plate} في النظام."
    )


def ask_language() -> str:
    # Keep ONE language in the spoken line — mixed AR/EN wrecks Piper quality.
    return "هل تفضّل العربية أم الإنجليزية؟ قل عربي، أو إنجليزي."


def phone_confirm_question(lang: str, phone: str) -> str:
    spoken = _speak_phone(phone, lang)
    if lang == "en":
        return (
            f"The phone number on file is {spoken}. "
            f"Is this your phone number?"
        )
    return (
        f"رقم الجوال المسجّل هو {spoken}. "
        f"هل هذا رقمك؟"
    )


def phone_confirm_retry(lang: str, phone: str) -> str:
    spoken = _speak_phone(phone, lang)
    if lang == "en":
        return (
            f"Sorry, I didn't catch that. "
            f"Is {spoken} your phone number? Please say yes or no."
        )
    return (
        f"عذراً، لم أفهم. هل {spoken} هو رقمك؟ "
        f"من فضلك قل نعم أو لا."
    )


def owner_check(lang: str) -> str:
    if lang == "en":
        return "Are you the owner of this vehicle?"
    return "هل أنت مالك هذه المركبة؟"


def owner_check_retry(lang: str) -> str:
    if lang == "en":
        return "Are you the owner of this vehicle? Please say yes or no."
    return "هل أنت مالك هذه المركبة؟ من فضلك قل نعم أو لا."


def ask_phone(lang: str) -> str:
    if lang == "en":
        return "Please say or enter the phone number we should use for this visit."
    return "من فضلك قل أو أدخل رقم الجوال الذي نستخدمه لهذه الزيارة."


def phone_heard_confirm(lang: str, phone: str) -> str:
    spoken = _speak_phone(phone, lang)
    if lang == "en":
        return f"I heard {spoken}. Is that correct?"
    return f"سمعت الرقم {spoken}. هل هذا صحيح؟"


def phone_unclear(lang: str) -> str:
    if lang == "en":
        return (
            "I didn't get a clear phone number. "
            "Please say the digits slowly, or use the keypad."
        )
    return (
        "لم ألتقط رقماً واضحاً. "
        "من فضلك قل الأرقام ببطء أو استخدم لوحة الأرقام."
    )


def phone_again(lang: str) -> str:
    if lang == "en":
        return "Okay. Please say or enter the phone number again."
    return "حسناً. من فضلك قل أو أدخل رقم الجوال مرة أخرى."


def phone_confirm_again(lang: str, phone: str) -> str:
    spoken = _speak_phone(phone, lang)
    if lang == "en":
        return f"Please confirm: is {spoken} correct? Say yes or no."
    return f"للتأكيد: هل {spoken} صحيح؟ قل نعم أو لا."


def done(lang: str) -> str:
    if lang == "en":
        return (
            "Thank you. Opening the gate now. "
            "You have been added to the queue. Have a great visit."
        )
    return (
        "شكراً لك. سيتم فتح البوابة الآن. "
        "تمت إضافتك إلى قائمة الانتظار. نتمنى لك زيارة طيبة."
    )


def escalate(lang: str) -> str:
    if lang == "en":
        return (
            "I'm having trouble confirming your details. "
            "Please wait — a staff member will assist you shortly."
        )
    return (
        "أواجه صعوبة في تأكيد بياناتك. "
        "من فضلك انتظر — سيقوم أحد الموظفين بمساعدتك قريباً."
    )


def language_retry() -> str:
    return (
        "عذراً، لم أفهم. قل عربي أو English. "
        "Sorry, please say Arabic or English."
    )


def language_set_ack(lang: str) -> str:
    if lang == "en":
        return "Okay, continuing in English."
    return "حسناً، سنكمل بالعربية."
