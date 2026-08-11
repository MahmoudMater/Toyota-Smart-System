import { Controller, Get, Query } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { LiveKitService } from './livekit.service';

class TokenQueryDto {
  @IsString()
  @MinLength(1)
  session_id!: string;

  @IsString()
  @MinLength(1)
  gate_id!: string;
}

@Controller('avatar')
export class AvatarController {
  constructor(private readonly livekit: LiveKitService) {}

  @Get('config')
  config() {
    return {
      adapter: this.livekit.isBeyEnabled() ? 'bey' : 'canvas',
      bey_enabled: this.livekit.isBeyEnabled(),
    };
  }

  @Get('token')
  async token(@Query() query: TokenQueryDto) {
    if (!this.livekit.isBeyEnabled()) {
      return { adapter: 'canvas' as const };
    }
    const join = await this.livekit.ensureRoomAndAgent({
      gateId: query.gate_id,
      sessionId: query.session_id,
    });
    return join ?? { adapter: 'canvas' as const };
  }
}
