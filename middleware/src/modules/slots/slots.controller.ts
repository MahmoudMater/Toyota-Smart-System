import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import {
  FreedBatchDto,
  SetAvailableSlotsDto,
  SlotFreedDto,
} from './dto/slot-freed.dto';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get('available')
  getAvailable() {
    return this.slots.getAvailable();
  }

  @Put('available')
  setAvailable(@Body() dto: SetAvailableSlotsDto) {
    return this.slots.setAvailable(dto);
  }

  @Post('freed')
  freed(
    @Body() dto: SlotFreedDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.slots.freed(dto, correlationId);
  }

  /** Free N slots → notify up to N waiting queue entries (concurrent per-slot claims). */
  @Post('freed-batch')
  freedBatch(
    @Body() dto: FreedBatchDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.slots.freedBatch(dto, correlationId);
  }
}
