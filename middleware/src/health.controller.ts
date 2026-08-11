import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.validation';
import { LiveKitService } from './modules/livekit/livekit.service';
import { SttService } from './modules/stt/stt.service';
import { TtsService } from './modules/tts/tts.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly tts: TtsService,
    private readonly stt: SttService,
    private readonly livekit: LiveKitService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  health() {
    const avatarAdapter = this.config.get('AVATAR_ADAPTER', { infer: true });
    return {
      ok: true,
      service: 'middleware',
      ts: new Date().toISOString(),
      tts_voices: this.tts.adapterName,
      stt_model: this.stt.adapterName,
      avatar_adapter: this.livekit.isBeyEnabled() ? 'bey' : avatarAdapter,
      bey_enabled: this.livekit.isBeyEnabled(),
    };
  }
}
