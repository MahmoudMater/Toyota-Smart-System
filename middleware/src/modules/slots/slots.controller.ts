import { Body, Controller, Headers, Post } from '@nestjs/common';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import { SlotFreedDto } from './dto/slot-freed.dto';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post('freed')
  freed(
    @Body() dto: SlotFreedDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.slots.freed(dto, correlationId);
  }
}
