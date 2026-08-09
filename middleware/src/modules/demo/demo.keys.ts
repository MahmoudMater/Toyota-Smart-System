export const DEMO_SAP_KEY = (plate: string) =>
  `demo:sap:${plate.trim().toUpperCase().replace(/\s+/g, '')}`;

export const DEMO_KEY_PATTERNS = [
  'qms:*',
  'kiosk:*',
  'lpr:active:*',
  'demo:sap:*',
  'slots:available',
] as const;

export const AUDIT_STREAM_KEY = 'audit:events';
