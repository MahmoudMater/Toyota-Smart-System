import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import {
  FreedBatchDto,
  SetAvailableSlotsDto,
  SlotFreedDto,
} from './dto/slot-freed.dto';
import { QueueEngineService } from './queue-engine.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly engine: QueueEngineService) {}

  @Get('available')
  getAvailable() {
    return this.engine.getAvailable();
  }

  @Put('available')
  setAvailable(@Body() dto: SetAvailableSlotsDto) {
    return this.engine.setAvailable(dto);
  }

  @Post('freed')
  freed(
    @Body() dto: SlotFreedDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.engine.freed(dto, correlationId);
  }

  @Post('freed-batch')
  freedBatch(
    @Body() dto: FreedBatchDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.engine.freedBatch(dto, correlationId);
  }
}
