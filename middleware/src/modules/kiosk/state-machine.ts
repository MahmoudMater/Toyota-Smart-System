import { ClientProfile } from '../../events/domain-events';
import * as i18n from './i18n';
import { extractDigits, normalizeYesNo } from '../../common/normalize';

export const MAX_RETRIES = 3;

export enum KioskState {
  Idle = 'idle',
  Greeting = 'greeting',
  AwaitingIdentityConfirm = 'awaiting_identity_confirm',
  AwaitingOwnerCheck = 'awaiting_owner_check',
  AwaitingPhoneSpeech = 'awaiting_phone_speech',
  AwaitingPhoneConfirm = 'awaiting_phone_confirm',
  Done = 'done',
  StaffEscalation = 'staff_escalation',
  NotRecognized = 'not_recognized',
}

export interface KioskSession {
  sessionId: string;
  gateId: string;
  state: KioskState;
  lang: string;
  profile: ClientProfile;
  visitPhone: string | null;
  pendingPhone: string | null;
  retries: number;
  gateOpenStub: boolean;
  lastPrompt: string;
  plateNumber: string;
}

export interface PublicSession {
  session_id: string;
  gate_id: string;
  lang: string;
  state: string;
  profile: {
    name: string;
    phone: string;
    phone_display: string;
    plate: string;
  };
  visit_phone: string | null;
  pending_phone: string | null;
  retries: number;
  max_retries: number;
  gate_open_stub: boolean;
  prompt: string;
  avatar_state: string;
  ui: {
    rtl: boolean;
    yes_label: string;
    no_label: string;
    show_language_buttons: boolean;
  };
}

export interface SessionInput {
  source: 'stt' | 'touch' | 'system';
  text?: string;
  choice?: 'yes' | 'no';
  phone_digits?: string;
}

export type SessionOutcome =
  | { kind: 'continue'; session: KioskSession }
  | {
      kind: 'completed';
      session: KioskSession;
      visitPhone: string;
      usedOnFilePhone: boolean;
    }
  | { kind: 'escalated'; session: KioskSession; reason: string };

function maskPhone(phone: string): string {
  const digits = extractDigits(phone) || phone;
  if (digits.length < 4) return digits;
  return `${digits.slice(0, 3)}-XXX-${digits.slice(-4)}`;
}

function avatarState(state: KioskState): string {
  switch (state) {
    case KioskState.Greeting:
      return 'talking';
    case KioskState.AwaitingIdentityConfirm:
    case KioskState.AwaitingOwnerCheck:
    case KioskState.AwaitingPhoneSpeech:
    case KioskState.AwaitingPhoneConfirm:
      return 'listening';
    default:
      return 'idle';
  }
}

export function toPublic(session: KioskSession): PublicSession {
  return {
    session_id: session.sessionId,
    gate_id: session.gateId,
    lang: session.lang,
    state: session.state,
    profile: {
      name: session.profile.name,
      phone: session.profile.phone,
      phone_display: maskPhone(session.profile.phone),
      plate: session.profile.plate,
    },
    visit_phone: session.visitPhone,
    pending_phone: session.pendingPhone,
    retries: session.retries,
    max_retries: MAX_RETRIES,
    gate_open_stub: session.gateOpenStub,
    prompt: session.lastPrompt,
    avatar_state: avatarState(session.state),
    ui: {
      rtl: false,
      yes_label: 'Yes',
      no_label: 'No',
      show_language_buttons: false,
    },
  };
}

export function createSession(params: {
  sessionId: string;
  gateId: string;
  profile: ClientProfile;
}): KioskSession {
  const greet = i18n.greeting(
    i18n.DEFAULT_LANG,
    params.profile.name,
    params.profile.plate,
  );
  const phoneQ = i18n.phoneConfirmQuestion(
    i18n.DEFAULT_LANG,
    params.profile.phone,
  );
  return {
    sessionId: params.sessionId,
    gateId: params.gateId,
    state: KioskState.AwaitingIdentityConfirm,
    lang: i18n.DEFAULT_LANG,
    profile: params.profile,
    visitPhone: null,
    pendingPhone: null,
    retries: 0,
    gateOpenStub: false,
    lastPrompt: `${greet} ${phoneQ}`,
    plateNumber: params.profile.plate,
  };
}

export function createNotRecognizedSession(params: {
  sessionId: string;
  gateId: string;
  plateNumber: string;
}): KioskSession {
  return {
    sessionId: params.sessionId,
    gateId: params.gateId,
    state: KioskState.NotRecognized,
    lang: i18n.DEFAULT_LANG,
    profile: { name: '', phone: '', plate: params.plateNumber },
    visitPhone: null,
    pendingPhone: null,
    retries: 0,
    gateOpenStub: false,
    lastPrompt: i18n.notRecognized(i18n.DEFAULT_LANG),
    plateNumber: params.plateNumber,
  };
}

function complete(session: KioskSession, phone: string): SessionOutcome {
  session.visitPhone = phone;
  session.gateOpenStub = true;
  session.state = KioskState.Done;
  session.lastPrompt = i18n.done(session.lang);
  return {
    kind: 'completed',
    session,
    visitPhone: phone,
    usedOnFilePhone: phone === session.profile.phone,
  };
}

function escalate(session: KioskSession, reason: string): SessionOutcome {
  session.state = KioskState.StaffEscalation;
  session.lastPrompt = i18n.escalate(session.lang);
  return { kind: 'escalated', session, reason };
}

function bumpRetry(
  session: KioskSession,
  reason: string,
): SessionOutcome | null {
  session.retries += 1;
  if (session.retries >= MAX_RETRIES) return escalate(session, reason);
  return null;
}

export function handleInput(
  session: KioskSession,
  input: SessionInput,
): SessionOutcome {
  if (
    session.state === KioskState.Done ||
    session.state === KioskState.StaffEscalation ||
    session.state === KioskState.NotRecognized
  ) {
    return { kind: 'continue', session };
  }

  let resolvedChoice: 'yes' | 'no' | null = null;
  if (input.choice === 'yes' || input.choice === 'no') {
    resolvedChoice = input.choice;
  } else if (input.text) {
    resolvedChoice = normalizeYesNo(input.text);
  }

  let digits: string | null = null;
  if (input.phone_digits) {
    digits = extractDigits(input.phone_digits) || input.phone_digits;
  } else if (input.text) {
    digits = extractDigits(input.text) || null;
  }

  if (session.state === KioskState.AwaitingIdentityConfirm) {
    if (resolvedChoice === 'yes') {
      return complete(session, session.profile.phone);
    }
    if (resolvedChoice === 'no') {
      session.state = KioskState.AwaitingOwnerCheck;
      session.retries = 0;
      session.lastPrompt = i18n.ownerCheck(session.lang);
      return { kind: 'continue', session };
    }
    const escalated = bumpRetry(session, 'unclear_identity_confirm');
    if (escalated) return escalated;
    session.lastPrompt = i18n.phoneConfirmRetry(
      session.lang,
      session.profile.phone,
    );
    return { kind: 'continue', session };
  }

  if (session.state === KioskState.AwaitingOwnerCheck) {
    if (resolvedChoice === 'yes') {
      session.state = KioskState.AwaitingPhoneSpeech;
      session.retries = 0;
      session.lastPrompt = i18n.askPhone(session.lang);
      return { kind: 'continue', session };
    }
    if (resolvedChoice === 'no') {
      return escalate(session, 'not_owner');
    }
    const escalated = bumpRetry(session, 'unclear_owner_check');
    if (escalated) return escalated;
    session.lastPrompt = i18n.ownerCheckRetry(session.lang);
    return { kind: 'continue', session };
  }

  if (session.state === KioskState.AwaitingPhoneSpeech) {
    if (digits && digits.length >= 7) {
      session.pendingPhone = digits;
      session.state = KioskState.AwaitingPhoneConfirm;
      session.retries = 0;
      session.lastPrompt = i18n.phoneHeardConfirm(session.lang, digits);
      return { kind: 'continue', session };
    }
    const escalated = bumpRetry(session, 'unclear_phone');
    if (escalated) return escalated;
    session.lastPrompt = i18n.phoneUnclear(session.lang);
    return { kind: 'continue', session };
  }

  if (session.state === KioskState.AwaitingPhoneConfirm) {
    if (resolvedChoice === 'yes' && session.pendingPhone) {
      return complete(session, session.pendingPhone);
    }
    if (resolvedChoice === 'no') {
      session.pendingPhone = null;
      session.state = KioskState.AwaitingPhoneSpeech;
      session.retries = 0;
      session.lastPrompt = i18n.phoneAgain(session.lang);
      return { kind: 'continue', session };
    }
    const escalated = bumpRetry(session, 'unclear_phone_confirm');
    if (escalated) return escalated;
    session.lastPrompt = i18n.phoneConfirmAgain(
      session.lang,
      session.pendingPhone || '',
    );
    return { kind: 'continue', session };
  }

  return { kind: 'continue', session };
}
