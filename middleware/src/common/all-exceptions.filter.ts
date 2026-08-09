import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{
      headers: Record<string, string | undefined>;
      method: string;
      url: string;
    }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    this.logger.error(
      {
        correlationId: req.headers[CORRELATION_HEADER],
        method: req.method,
        url: req.url,
        status,
        err: exception instanceof Error ? exception.message : String(exception),
      },
      'unhandled.exception',
    );

    res.status(status).json({
      statusCode: status,
      message,
      correlationId: req.headers[CORRELATION_HEADER],
    });
  }
}
