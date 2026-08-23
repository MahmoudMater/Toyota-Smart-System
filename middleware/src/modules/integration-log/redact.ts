const SENSITIVE_HEADER_KEYS = new Set([
  'xi-api-key',
  'authorization',
  'x-api-key',
  'api-key',
  'apikey',
]);

const SENSITIVE_KEY_RE =
  /(?:^|_)(api[_-]?key|secret|password|token|authorization)$/i;

export function redactHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ||
      SENSITIVE_KEY_RE.test(key)
    ) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function redactValue(value: unknown, maxChars: number): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return truncate(value, maxChars);
  }
  if (Buffer.isBuffer(value)) {
    return `<${value.length} bytes>`;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((v) => redactValue(v, maxChars));
    }
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      if (
        SENSITIVE_KEY_RE.test(key) ||
        SENSITIVE_HEADER_KEYS.has(key.toLowerCase())
      ) {
        out[key] = '[REDACTED]';
      } else if (
        (key === 'audio' || key === 'image' || key === 'body') &&
        (Buffer.isBuffer(v) ||
          (typeof v === 'object' && v !== null && 'byteLength' in v))
      ) {
        const len = Buffer.isBuffer(v)
          ? v.length
          : typeof (v as { byteLength?: number }).byteLength === 'number'
            ? (v as { byteLength: number }).byteLength
            : '?';
        out[key] = `<${len} bytes>`;
      } else {
        out[key] = redactValue(v, maxChars);
      }
    }
    return out;
  }
  return value;
}

export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…(+${text.length - maxChars} chars)`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
