import { Controller, Get } from '@nestjs/common';
import { QueueEngineService } from './queue-engine.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly engine: QueueEngineService) {}

  @Get()
  list() {
    return this.engine.listQueue();
  }
}
