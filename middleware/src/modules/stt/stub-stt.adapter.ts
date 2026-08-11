import { Injectable } from '@nestjs/common';
import type { SpeechTranscriber, TranscribeResult } from './speech.transcriber';

@Injectable()
export class StubSttAdapter implements SpeechTranscriber {
  readonly adapterName = 'stub';

  async transcribe(
    _audioBuffer: Buffer,
    _filename: string,
    _lang?: string,
  ): Promise<TranscribeResult> {
    return { text: 'yes' };
  }
}
