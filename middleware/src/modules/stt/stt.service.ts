import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { SpeechTranscriber } from './speech.transcriber';
import { SPEECH_TRANSCRIBER } from './speech.transcriber';
import { NluService } from '../nlu/nlu.service';

export interface SttResult {
  text: string;
  normalized: 'yes' | 'no' | 'digits' | null;
  digits: string | null;
}

@Injectable()
export class SttService {
  constructor(
    @Inject(SPEECH_TRANSCRIBER)
    private readonly transcriber: SpeechTranscriber,
    private readonly nlu: NluService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SttService.name);
  }

  get adapterName(): string {
    return this.transcriber.adapterName;
  }

  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    lang?: string,
  ): Promise<SttResult> {
    if (!audioBuffer.length) {
      throw new Error('audio is empty');
    }

    const raw = await this.transcriber.transcribe(audioBuffer, filename, lang);
    const result = await this.nlu.interpret(raw.text);

    this.logger.debug(
      {
        text: result.text,
        normalized: result.normalized,
        nluAdapter: this.nlu.adapterName,
      },
      'stt.transcribed',
    );
    return result;
  }
}
