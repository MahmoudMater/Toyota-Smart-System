"""Conversation state machine for the kiosk voice agent (no LLM)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import i18n
from normalize import extract_digits, normalize_language, normalize_yes_no

logger = logging.getLogger("kiosk.state_machine")

MAX_RETRIES = 3


class State(str, Enum):
    IDLE = "idle"
    GREETING = "greeting"
    AWAITING_LANGUAGE = "awaiting_language"
    AWAITING_IDENTITY_CONFIRM = "awaiting_identity_confirm"
    AWAITING_OWNER_CHECK = "awaiting_owner_check"
    AWAITING_PHONE_SPEECH = "awaiting_phone_speech"
    AWAITING_PHONE_CONFIRM = "awaiting_phone_confirm"
    DONE = "done"
    STAFF_ESCALATION = "staff_escalation"


FAKE_PROFILE = {
    "name": "Ahmed Hassan",
    "phone": "0501234567",
    "plate": "ABC 1234",
}


def _mask_phone(phone: str) -> str:
    digits = extract_digits(phone) or phone
    if len(digits) < 4:
        return digits
    return f"{digits[:3]}-XXX-{digits[-4:]}"


@dataclass
class Session:
    session_id: str
    gate_id: str
    state: State = State.IDLE
    lang: str = i18n.DEFAULT_LANG  # "en" default (Arabic disabled for now)
    profile: dict[str, str] = field(default_factory=lambda: dict(FAKE_PROFILE))
    visit_phone: str | None = None
    pending_phone: str | None = None
    retries: int = 0
    gate_open_stub: bool = False
    last_prompt: str = ""

    def to_public(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "gate_id": self.gate_id,
            "lang": self.lang,
            "state": self.state.value,
            "profile": {
                "name": self.profile["name"],
                "phone_display": _mask_phone(self.profile["phone"]),
                "phone": self.profile["phone"],
                "plate": self.profile["plate"],
            },
            "visit_phone": self.visit_phone,
            "pending_phone": self.pending_phone,
            "retries": self.retries,
            "max_retries": MAX_RETRIES,
            "gate_open_stub": self.gate_open_stub,
            "prompt": self.last_prompt,
            "avatar_state": self.avatar_state(),
            "ui": {
                "rtl": False,
                "yes_label": "Yes",
                "no_label": "No",
                "show_language_buttons": False,
            },
        }

    def avatar_state(self) -> str:
        if self.state in {
            State.GREETING,
            State.AWAITING_LANGUAGE,
            State.AWAITING_IDENTITY_CONFIRM,
            State.AWAITING_OWNER_CHECK,
            State.AWAITING_PHONE_SPEECH,
            State.AWAITING_PHONE_CONFIRM,
        }:
            if self.state == State.GREETING:
                return "talking"
            return "listening"
        return "idle"


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def create(self, gate_id: str = "gate-1") -> Session:
        session = Session(
            session_id=str(uuid.uuid4()),
            gate_id=gate_id or "gate-1",
            lang=i18n.DEFAULT_LANG,
        )
        self._sessions[session.session_id] = session
        return session


def _set_prompt(session: Session, prompt: str) -> None:
    session.last_prompt = prompt


def _phone_prompt(session: Session) -> str:
    return i18n.phone_confirm_question(session.lang, session.profile["phone"])


def start_session(store: SessionStore, gate_id: str = "gate-1") -> dict[str, Any]:
    session = store.create(gate_id=gate_id)
    session.lang = i18n.DEFAULT_LANG
    session.state = State.GREETING
    name = session.profile["name"]
    plate = session.profile["plate"]
    phone = session.profile["phone"]

    # English-only for now: greet + phone question (no language picker).
    # When ARABIC_ENABLED is turned back on, restore awaiting_language here.
    greet = i18n.greeting(session.lang, name, plate)
    phone_q = i18n.phone_confirm_question(session.lang, phone)
    _set_prompt(session, f"{greet} {phone_q}")
    session.state = State.AWAITING_IDENTITY_CONFIRM

    logger.info(
        "session_start session_id=%s gate_id=%s lang=%s profile=%s",
        session.session_id,
        session.gate_id,
        session.lang,
        session.profile["name"],
    )
    return session.to_public()


def _escalate(session: Session, reason: str) -> dict[str, Any]:
    session.state = State.STAFF_ESCALATION
    _set_prompt(session, i18n.escalate(session.lang))
    logger.warning(
        "staff_escalation session_id=%s gate_id=%s reason=%s retries=%s lang=%s",
        session.session_id,
        session.gate_id,
        reason,
        session.retries,
        session.lang,
    )
    return session.to_public()


def _complete(session: Session, phone: str) -> dict[str, Any]:
    session.visit_phone = phone
    session.gate_open_stub = True
    session.state = State.DONE
    _set_prompt(session, i18n.done(session.lang))
    logger.info(
        "gate_open_stub session_id=%s gate_id=%s visit_phone=%s plate=%s lang=%s",
        session.session_id,
        session.gate_id,
        session.visit_phone,
        session.profile["plate"],
        session.lang,
    )
    return session.to_public()


def _bump_retry(session: Session, reason: str) -> dict[str, Any] | None:
    session.retries += 1
    if session.retries >= MAX_RETRIES:
        return _escalate(session, reason)
    return None


def _after_language_chosen(session: Session, lang: str) -> dict[str, Any]:
    session.lang = lang if lang in i18n.SUPPORTED else i18n.DEFAULT_LANG
    session.retries = 0
    session.state = State.AWAITING_IDENTITY_CONFIRM
    ack = i18n.language_set_ack(session.lang)
    phone_q = _phone_prompt(session)
    _set_prompt(session, f"{ack} {phone_q}")
    logger.info(
        "language_set session_id=%s lang=%s",
        session.session_id,
        session.lang,
    )
    return session.to_public()


def handle_input(
    session: Session,
    *,
    source: str,
    text: str | None = None,
    choice: str | None = None,
    phone_digits: str | None = None,
    language: str | None = None,
) -> dict[str, Any]:
    """Advance the state machine from touch or STT input."""
    if session.state in {State.DONE, State.STAFF_ESCALATION}:
        return session.to_public()

    resolved_choice = None
    if choice in {"yes", "no"}:
        resolved_choice = choice
    elif text:
        resolved_choice = normalize_yes_no(text)

    resolved_lang = None
    if language in i18n.SUPPORTED:
        resolved_lang = language
    elif choice in i18n.SUPPORTED:
        resolved_lang = choice
    elif text:
        resolved_lang = normalize_language(text)

    digits = None
    if phone_digits:
        digits = extract_digits(phone_digits) or phone_digits
    elif text:
        digits = extract_digits(text) or None

    state = session.state

    if state == State.AWAITING_LANGUAGE:
        # Arabic / language picker disabled — keep unreachable unless re-enabled later.
        if not i18n.ARABIC_ENABLED:
            return _after_language_chosen(session, "en")
        if resolved_lang:
            return _after_language_chosen(session, resolved_lang)
        escalated = _bump_retry(session, "unclear_language")
        if escalated:
            return escalated
        _set_prompt(session, i18n.language_retry())
        return session.to_public()

    if state == State.AWAITING_IDENTITY_CONFIRM:
        if resolved_choice == "yes":
            return _complete(session, session.profile["phone"])
        if resolved_choice == "no":
            session.state = State.AWAITING_OWNER_CHECK
            session.retries = 0
            _set_prompt(session, i18n.owner_check(session.lang))
            return session.to_public()
        escalated = _bump_retry(session, "unclear_identity_confirm")
        if escalated:
            return escalated
        _set_prompt(session, i18n.phone_confirm_retry(session.lang, session.profile["phone"]))
        return session.to_public()

    if state == State.AWAITING_OWNER_CHECK:
        if resolved_choice == "yes":
            session.state = State.AWAITING_PHONE_SPEECH
            session.retries = 0
            _set_prompt(session, i18n.ask_phone(session.lang))
            return session.to_public()
        if resolved_choice == "no":
            return _escalate(session, "not_owner")
        escalated = _bump_retry(session, "unclear_owner_check")
        if escalated:
            return escalated
        _set_prompt(session, i18n.owner_check_retry(session.lang))
        return session.to_public()

    if state == State.AWAITING_PHONE_SPEECH:
        if digits and len(digits) >= 7:
            session.pending_phone = digits
            session.state = State.AWAITING_PHONE_CONFIRM
            session.retries = 0
            _set_prompt(session, i18n.phone_heard_confirm(session.lang, digits))
            return session.to_public()
        escalated = _bump_retry(session, "unclear_phone")
        if escalated:
            return escalated
        _set_prompt(session, i18n.phone_unclear(session.lang))
        return session.to_public()

    if state == State.AWAITING_PHONE_CONFIRM:
        if resolved_choice == "yes" and session.pending_phone:
            return _complete(session, session.pending_phone)
        if resolved_choice == "no":
            session.pending_phone = None
            session.state = State.AWAITING_PHONE_SPEECH
            session.retries = 0
            _set_prompt(session, i18n.phone_again(session.lang))
            return session.to_public()
        escalated = _bump_retry(session, "unclear_phone_confirm")
        if escalated:
            return escalated
        pending = session.pending_phone or ""
        _set_prompt(session, i18n.phone_confirm_again(session.lang, pending))
        return session.to_public()

    logger.error(
        "unexpected_state session_id=%s state=%s source=%s",
        session.session_id,
        session.state,
        source,
    )
    return session.to_public()
