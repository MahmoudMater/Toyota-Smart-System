import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { redactHeaders, redactValue, truncate } from './redact';
import { formatRecord } from './pretty-format';
import { LogFileSink } from './log-file.sink';
import { LogStreamSink } from './log-stream.sink';
import { IntegrationLogService } from './integration-log.service';

describe('redact', () => {
  it('redacts sensitive headers', () => {
    const out = redactHeaders({
      'xi-api-key': 'secret',
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
    });
    expect(out?.['xi-api-key']).toBe('[REDACTED]');
    expect(out?.Authorization).toBe('[REDACTED]');
    expect(out?.['Content-Type']).toBe('application/json');
  });

  it('redacts api keys and binary fields in objects', () => {
    const out = redactValue(
      {
        ELEVENLABS_API_KEY: 'sk_live',
        text: 'hello',
        audio: Buffer.from('abc'),
      },
      100,
    ) as Record<string, unknown>;
    expect(out.ELEVENLABS_API_KEY).toBe('[REDACTED]');
    expect(out.text).toBe('hello');
    expect(out.audio).toBe('<3 bytes>');
  });

  it('truncates long strings', () => {
    expect(truncate('abcdefghij', 4)).toBe('abcd…(+6 chars)');
  });
});

describe('pretty-format', () => {
  it('formats a request with detail and text', () => {
    const pretty = formatRecord(
      {
        at: '2026-08-11T13:52:03.482Z',
        integration: 'elevenlabs',
        kind: 'request',
        op: 'tts.synthesize',
        method: 'POST',
        url: 'https://api.elevenlabs.io/v1/text-to-speech/abc',
        attempt: 1,
        detail: { model: 'eleven_v3', chars: 12, text: 'hello world' },
      },
      2000,
    );
    expect(pretty).toContain('elevenlabs');
    expect(pretty).toContain('->');
    expect(pretty).toContain('POST');
    expect(pretty).toContain('op=tts.synthesize');
    expect(pretty).toContain('text=hello world');
  });

  it('formats a response with bytes', () => {
    const pretty = formatRecord(
      {
        at: '2026-08-11T13:52:04.913Z',
        integration: 'elevenlabs',
        kind: 'response',
        op: 'tts.synthesize',
        status: 200,
        durationMs: 1431,
        detail: { bytes: 74900, contentType: 'audio/mpeg' },
      },
      2000,
    );
    expect(pretty).toContain('<-');
    expect(pretty).toContain('200 OK');
    expect(pretty).toContain('1431ms');
    expect(pretty).toContain('KB');
  });
});

describe('IntegrationLogService', () => {
  let dir: string;
  let files: LogFileSink;
  let stream: LogStreamSink;
  let service: IntegrationLogService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'intlog-'));
    const vals: Record<string, unknown> = {
      INTEGRATION_LOG_ENABLED: true,
      INTEGRATION_LOG_DIR: dir,
      INTEGRATION_LOG_MAX_BODY_CHARS: 50,
      INTEGRATION_LOG_MAX_FILE_MB: 1,
      INTEGRATION_LOG_ROTATE_KEEP: 2,
    };
    const config = {
      get: (key: string) => vals[key],
    } as unknown as ConfigService<Env, true>;
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as PinoLogger;
    files = new LogFileSink(config);
    files.onModuleInit();
    stream = new LogStreamSink();
    service = new IntegrationLogService(config, files, stream, logger);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes event to per-integration and combined files', () => {
    service.event('elevenlabs', 'tts.cache.hit', {
      chars: 10,
      text: 'x'.repeat(100),
      api_key: 'should-hide',
    });

    const el = readFileSync(join(dir, 'elevenlabs.log'), 'utf8');
    const all = readFileSync(join(dir, 'integrations.log'), 'utf8');
    expect(el).toContain('tts.cache.hit');
    expect(el).toContain('[REDACTED]');
    expect(el).toContain('…(+');
    expect(all).toContain('tts.cache.hit');
  });

  it('startCall records request, response, and duration', () => {
    const call = service.startCall({
      integration: 'elevenlabs',
      op: 'tts.synthesize',
      method: 'POST',
      url: 'https://api.elevenlabs.io/v1/text-to-speech/x',
      request: { text: 'hi' },
    });
    call.success({ status: 200, response: { bytes: 12 } });

    const el = readFileSync(join(dir, 'elevenlabs.log'), 'utf8');
    expect(el).toContain('->');
    expect(el).toContain('<-');
    expect(el).toContain('200 OK');
  });

  it('streams lines to the ring buffer', () => {
    service.event('lpr', 'lpr.plate.accepted', { plateNumber: 'ABC' });
    const backlog = stream.backlog('lpr');
    expect(backlog).toHaveLength(1);
    expect(backlog[0].integration).toBe('lpr');
    expect(stream.backlog('all')).toHaveLength(1);
  });

  it('rotates when file exceeds max size', () => {
    files.setMaxBytesForTests(80);
    service.event('nlu', 'nlu.seed', { note: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    const path = join(dir, 'nlu.log');
    writeFileSync(path, 'y'.repeat(120));
    files.setSizeForTests('nlu', 120);

    service.event('nlu', 'nlu.after', { note: 'rotated-path' });

    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.1`)).toBe(true);
    const current = readFileSync(path, 'utf8');
    expect(current).toContain('nlu.after');
  });
});
