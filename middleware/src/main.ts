import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import {
  CORRELATION_HEADER,
  CorrelationIdMiddleware,
} from './common/correlation-id.middleware';
import { Env } from './config/env.validation';
import { randomUUID } from 'crypto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const correlation = new CorrelationIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) => {
    correlation.use(req, res, next);
  });

  // Ensure correlation id exists even if middleware order shifts
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.headers[CORRELATION_HEADER]) {
      const id = randomUUID();
      req.headers[CORRELATION_HEADER] = id;
      res.setHeader(CORRELATION_HEADER, id);
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = app.get(ConfigService<Env, true>);
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
