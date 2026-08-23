import type { IntegrationLogRecord, LogKind } from './integrations';
import { formatBytes, truncate } from './redact';

const KIND_ARROW: Record<LogKind, string> = {
  request: '->',
  response: '<-',
  error: '!!',
  retry: '~>',
  event: '**',
};

function stringifyDetail(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value == null) return value === null ? 'null' : 'undefined';
  try {
    return JSON.stringify(value) ?? '[unserializable]';
  } catch {
    return '[unserializable]';
  }
}

function timeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function padIntegration(name: string): string {
  return name.padEnd(14, ' ');
}

function formatDetailLines(
  detail: Record<string, unknown> | undefined,
  indent: string,
  maxChars: number,
): string[] {
  if (!detail || Object.keys(detail).length === 0) return [];
  const lines: string[] = [];
  const summaryKeys: string[] = [];
  const longKeys: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(detail)) {
    if (value == null) continue;
    if (
      typeof value === 'string' &&
      (value.length > 80 || value.includes('\n'))
    ) {
      longKeys.push([key, truncate(value, maxChars)]);
    } else if (typeof value === 'object') {
      longKeys.push([key, truncate(JSON.stringify(value), maxChars)]);
    } else {
      summaryKeys.push(`${key}=${stringifyDetail(value)}`);
    }
  }

  if (summaryKeys.length) {
    lines.push(`${indent}${summaryKeys.join('  ')}`);
  }
  for (const [key, value] of longKeys) {
    const nested = value.split('\n');
    lines.push(`${indent}${key}: ${nested[0]}`);
    for (let i = 1; i < nested.length; i++) {
      lines.push(`${indent}  ${nested[i]}`);
    }
  }
  return lines;
}

export function formatRecord(
  record: Omit<IntegrationLogRecord, 'pretty'>,
  maxChars: number,
): string {
  const t = timeOnly(record.at);
  const integ = padIntegration(record.integration);
  const arrow = KIND_ARROW[record.kind];
  const indent = ' '.repeat(35);

  const headParts: string[] = [`${t}  ${integ}  ${arrow}`];

  if (record.kind === 'request') {
    const method = record.method ?? 'POST';
    const url = record.url ?? '';
    headParts.push(`  ${method} ${url}`);
  } else if (record.kind === 'response') {
    const status = record.status ?? 200;
    const dur =
      record.durationMs != null ? `${record.durationMs}ms` : undefined;
    const bytes =
      typeof record.detail?.bytes === 'number'
        ? formatBytes(record.detail.bytes)
        : undefined;
    const contentType =
      typeof record.detail?.contentType === 'string'
        ? record.detail.contentType
        : undefined;
    headParts.push(
      `  ${status} OK${dur ? `   ${dur}` : ''}${bytes ? `   ${bytes}` : ''}${contentType ? ` ${contentType}` : ''}`,
    );
  } else if (record.kind === 'error') {
    const status = record.status != null ? String(record.status) : 'ERR';
    const dur =
      record.durationMs != null ? `${record.durationMs}ms` : undefined;
    headParts.push(
      `  ${status}${dur ? `   ${dur}` : ''}${record.error ? `  ${record.error}` : ''}`,
    );
  } else if (record.kind === 'retry') {
    headParts.push(
      `  retry attempt=${record.attempt ?? '?'} delayMs=${record.delayMs ?? '?'}${record.status != null ? ` status=${record.status}` : ''}`,
    );
  } else {
    headParts.push(`  ${record.op ?? 'event'}`);
  }

  if (record.op && record.kind !== 'event') {
    headParts.push(`   op=${record.op}`);
  }
  if (record.correlationId) {
    headParts.push(` cid=${record.correlationId.slice(0, 8)}`);
  }
  if (record.attempt != null && record.kind === 'request') {
    headParts.push(` attempt=${record.attempt}`);
  }

  const lines = [headParts.join('')];
  lines.push(...formatDetailLines(record.detail, indent, maxChars));

  if (record.body) {
    const truncated = truncate(record.body, maxChars);
    for (const line of truncated.split('\n')) {
      lines.push(`${indent}body: ${line}`);
    }
  }

  return lines.join('\n');
}
