import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import type {
  Integration,
  IntegrationLogRecord,
  LogKind,
} from './integrations';
import { formatRecord } from './pretty-format';
import { redactValue } from './redact';
import { LogFileSink } from './log-file.sink';
import { LogStreamSink } from './log-stream.sink';

export interface StartCallOptions {
  integration: Integration;
  op: string;
  method?: string;
  url?: string;
  correlationId?: string;
  attempt?: number;
  request?: Record<string, unknown>;
}

export interface CallSuccessOptions {
  status?: number;
  response?: Record<string, unknown>;
}

export interface CallFailureOptions {
  status?: number;
  error?: string;
  body?: string;
  response?: Record<string, unknown>;
}

export interface CallRetryOptions {
  attempt: number;
  delayMs: number;
  status?: number;
}

export interface CallHandle {
  success(opts?: CallSuccessOptions): void;
  failure(opts?: CallFailureOptions): void;
  retry(opts: CallRetryOptions): void;
}

@Injectable()
export class IntegrationLogService {
  private readonly enabled: boolean;
  private readonly maxBodyChars: number;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly files: LogFileSink,
    private readonly stream: LogStreamSink,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IntegrationLogService.name);
    this.enabled = this.config.get('INTEGRATION_LOG_ENABLED', { infer: true });
    this.maxBodyChars = this.config.get('INTEGRATION_LOG_MAX_BODY_CHARS', {
      infer: true,
    });
  }

  event(
    integration: Integration,
    event: string,
    detail?: Record<string, unknown>,
    correlationId?: string,
  ): void {
    if (!this.enabled) return;
    this.emit({
      at: new Date().toISOString(),
      integration,
      kind: 'event',
      op: event,
      correlationId,
      detail: detail
        ? (redactValue(detail, this.maxBodyChars) as Record<string, unknown>)
        : undefined,
    });
  }

  startCall(opts: StartCallOptions): CallHandle {
    const started = Date.now();
    if (!this.enabled) {
      return {
        success: () => undefined,
        failure: () => undefined,
        retry: () => undefined,
      };
    }

    const requestDetail = opts.request
      ? (redactValue(opts.request, this.maxBodyChars) as Record<
          string,
          unknown
        >)
      : undefined;

    this.emit({
      at: new Date().toISOString(),
      integration: opts.integration,
      kind: 'request',
      op: opts.op,
      method: opts.method,
      url: opts.url,
      correlationId: opts.correlationId,
      attempt: opts.attempt,
      detail: requestDetail,
    });

    return {
      success: (successOpts?: CallSuccessOptions) => {
        this.emit({
          at: new Date().toISOString(),
          integration: opts.integration,
          kind: 'response',
          op: opts.op,
          method: opts.method,
          url: opts.url,
          status: successOpts?.status ?? 200,
          durationMs: Date.now() - started,
          correlationId: opts.correlationId,
          detail: successOpts?.response
            ? (redactValue(successOpts.response, this.maxBodyChars) as Record<
                string,
                unknown
              >)
            : undefined,
        });
      },
      failure: (failureOpts?: CallFailureOptions) => {
        this.emit({
          at: new Date().toISOString(),
          integration: opts.integration,
          kind: 'error',
          op: opts.op,
          method: opts.method,
          url: opts.url,
          status: failureOpts?.status,
          durationMs: Date.now() - started,
          correlationId: opts.correlationId,
          error: failureOpts?.error,
          body: failureOpts?.body
            ? String(redactValue(failureOpts.body, this.maxBodyChars))
            : undefined,
          detail: failureOpts?.response
            ? (redactValue(failureOpts.response, this.maxBodyChars) as Record<
                string,
                unknown
              >)
            : undefined,
        });
      },
      retry: (retryOpts: CallRetryOptions) => {
        this.emit({
          at: new Date().toISOString(),
          integration: opts.integration,
          kind: 'retry',
          op: opts.op,
          method: opts.method,
          url: opts.url,
          status: retryOpts.status,
          attempt: retryOpts.attempt,
          delayMs: retryOpts.delayMs,
          correlationId: opts.correlationId,
        });
      },
    };
  }

  private emit(partial: Omit<IntegrationLogRecord, 'pretty'>): void {
    const pretty = formatRecord(partial, this.maxBodyChars);
    const record: IntegrationLogRecord = { ...partial, pretty };
    this.files.write(record);
    this.stream.write(record);
    this.toPino(record);
  }

  private toPino(record: IntegrationLogRecord): void {
    const payload = {
      integration: record.integration,
      kind: record.kind,
      op: record.op,
      method: record.method,
      url: record.url,
      status: record.status,
      durationMs: record.durationMs,
      attempt: record.attempt,
      delayMs: record.delayMs,
      correlationId: record.correlationId,
      detail: record.detail,
      error: record.error,
    };
    const msg = `integration.${record.integration}.${record.kind}${record.op ? `.${record.op}` : ''}`;
    const level = pinoLevel(record.kind);
    if (level === 'error') {
      this.logger.error(payload, msg);
    } else if (level === 'warn') {
      this.logger.warn(payload, msg);
    } else {
      this.logger.info(payload, msg);
    }
  }
}

function pinoLevel(kind: LogKind): 'info' | 'warn' | 'error' {
  if (kind === 'error') return 'error';
  if (kind === 'retry') return 'warn';
  return 'info';
}
