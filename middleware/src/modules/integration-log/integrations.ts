export const INTEGRATIONS = [
  'elevenlabs',
  'lpr',
  'nlu',
  'sap',
  'gate',
  'notifications',
  'tts',
  'stt',
] as const;

export type Integration = (typeof INTEGRATIONS)[number];

export type LogKind = 'request' | 'response' | 'error' | 'retry' | 'event';

export interface IntegrationLogRecord {
  at: string;
  integration: Integration;
  kind: LogKind;
  op?: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  attempt?: number;
  delayMs?: number;
  correlationId?: string;
  detail?: Record<string, unknown>;
  error?: string;
  body?: string;
  /** Pre-formatted pretty text (multi-line). */
  pretty: string;
}

export function isIntegration(value: string): value is Integration {
  return (INTEGRATIONS as readonly string[]).includes(value);
}
