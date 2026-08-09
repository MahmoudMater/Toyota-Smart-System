import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      headers: Record<string, string | undefined>;
    }>();
    const started = Date.now();
    const correlationId = req.headers[CORRELATION_HEADER];
    this.logger.info(
      { correlationId, method: req.method, url: req.url },
      'http.request',
    );
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.info(
            {
              correlationId,
              method: req.method,
              url: req.url,
              durationMs: Date.now() - started,
            },
            'http.response',
          );
        },
        error: (err: Error) => {
          this.logger.error(
            {
              correlationId,
              method: req.method,
              url: req.url,
              durationMs: Date.now() - started,
              err: err.message,
            },
            'http.error',
          );
        },
      }),
    );
  }
}
