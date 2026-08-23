import { Global, Module } from '@nestjs/common';
import { IntegrationLogService } from './integration-log.service';
import { LogFileSink } from './log-file.sink';
import { LogStreamSink } from './log-stream.sink';
import { LogsGateway } from './logs.gateway';

@Global()
@Module({
  providers: [LogFileSink, LogStreamSink, IntegrationLogService, LogsGateway],
  exports: [IntegrationLogService, LogStreamSink],
})
export class IntegrationLogModule {}
