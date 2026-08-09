import { Body, Controller, Headers, Post } from '@nestjs/common';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import { PlateReadDto } from './dto/plate-read.dto';
import { LprService } from './lpr.service';

@Controller('lpr')
export class LprController {
  constructor(private readonly lpr: LprService) {}

  @Post('plate-read')
  ingest(
    @Body() dto: PlateReadDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.lpr.ingest(dto, correlationId);
  }
}
