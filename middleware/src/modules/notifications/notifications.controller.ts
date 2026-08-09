import { Body, Controller, Headers, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { CORRELATION_HEADER } from '../../common/correlation-id.middleware';
import { NotificationsService } from './notifications.service';

class WhatsAppConfirmDto {
  @IsString()
  @MinLength(1)
  entryId!: string;

  @IsString()
  @MinLength(1)
  slotId!: string;

  @IsString()
  @MinLength(1)
  plateNumber!: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('whatsapp/confirm')
  confirm(
    @Body() dto: WhatsAppConfirmDto,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ) {
    this.notifications.confirmViaWhatsApp({ ...dto, correlationId });
    return { ok: true };
  }
}
