export type AvatarState = "idle" | "talking" | "listening";

export interface SessionProfile {
  name?: string;
  plate?: string;
  phone?: string;
  phone_display?: string;
}

export interface PublicSession {
  session_id: string;
  gate_id: string;
  state: string;
  lang?: string;
  profile?: SessionProfile;
  prompt?: string;
  speech?: string;
  avatar_state?: AvatarState;
  retries?: number;
  max_retries?: number;
  gate_open_stub?: boolean;
  visit_phone?: string;
  ui?: {
    yes_label?: string;
    no_label?: string;
  };
}

export interface SessionInputPayload {
  source: "touch" | "stt";
  choice?: "yes" | "no" | "ar" | "en";
  text?: string;
  phone_digits?: string;
  language?: string;
}

export interface SttResult {
  text?: string;
  normalized?: string;
  digits?: string;
}

export interface QueueEntry {
  id: string;
  plateNumber?: string;
  phone?: string;
  status?: string;
  slotId?: string;
  notifiedAt?: string;
}

export interface AuditEvent {
  id?: string;
  event?: string;
  at?: string;
  payload?: unknown;
}

export interface HealthResponse {
  service?: string;
  tts_voices?: string;
  stt_model?: string;
}

export interface DemoConfig {
  claimTimeoutMs?: number;
}

export interface LogLine {
  kind?: string;
  pretty?: string;
}

export interface ActiveClaim {
  entryId: string;
  slotId: string;
  plateNumber: string;
  notifiedAt: string;
}

export const DEFAULT_MW_URL =
  process.env.NEXT_PUBLIC_MW_URL ?? "http://127.0.0.1:3000";

export const STORAGE_KEY = "tamkeen.demo.mwUrl";
