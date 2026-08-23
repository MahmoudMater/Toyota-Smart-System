import { Injectable } from '@nestjs/common';
import { normalizeTranscript } from '../../common/normalize';
import type {
  TranscriptInterpreter,
  NluInterpretResult,
} from './transcript.interpreter';

@Injectable()
export class RulesNluAdapter implements TranscriptInterpreter {
  readonly adapterName = 'rules';

  async interpret(text: string): Promise<NluInterpretResult> {
    return normalizeTranscript(text);
  }
}
