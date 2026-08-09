import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  NotFoundException,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import { KioskService } from './kiosk.service';
import { SessionInput } from './state-machine';

class StartSessionDto {
  @IsOptional()
  @IsString()
  gateId?: string;
}

class SessionInputDto implements SessionInput {
  @IsIn(['stt', 'touch', 'system'])
  source!: 'stt' | 'touch' | 'system';

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['yes', 'no'])
  choice?: 'yes' | 'no';

  @IsOptional()
  @IsString()
  phone_digits?: string;
}

@Controller('session')
export class KioskController {
  constructor(private readonly kiosk: KioskService) {}

  @Post('start')
  start(
    @Body() dto: StartSessionDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    return this.kiosk.startManual(dto.gateId || 'gate-1', correlationId);
  }

  @Get(':sessionId')
  async get(@Param('sessionId') sessionId: string) {
    const session = await this.kiosk.getSession(sessionId);
    if (!session) throw new NotFoundException('session_not_found');
    return session;
  }

  @Post(':sessionId/input')
  async input(
    @Param('sessionId') sessionId: string,
    @Body() dto: SessionInputDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    const session = await this.kiosk.handleSessionInput(
      sessionId,
      dto,
      correlationId,
    );
    if (!session) throw new NotFoundException('session_not_found');
    return session;
  }
}
