import { Controller, Get } from '@nestjs/common';
import { TtsService } from './modules/tts/tts.service';
import { SttService } from './modules/stt/stt.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly tts: TtsService,
    private readonly stt: SttService,
  ) {}

  @Get()
  health() {
    return {
      ok: true,
      service: 'middleware',
      ts: new Date().toISOString(),
      tts_voices: this.tts.adapterName,
      stt_model: this.stt.adapterName,
    };
  }
}
