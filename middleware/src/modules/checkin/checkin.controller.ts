import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import { CheckinService } from './checkin.service';
import { SubmitCheckinDto } from './dto/submit-checkin.dto';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Get('display/:gateId')
  getDisplay(@Param('gateId') gateId: string) {
    return this.checkin.getDisplay(gateId);
  }

  @Get('tickets/:token')
  getTicket(
    @Param('token') token: string,
    @Query('gateId') gateId?: string,
  ) {
    return this.checkin.getTicket(token, gateId);
  }

  @Post('submit')
  submit(
    @Body() dto: SubmitCheckinDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.checkin.submit({ ...dto, correlationId });
  }
}
