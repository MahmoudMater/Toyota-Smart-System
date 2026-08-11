import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { normalizeTranscript } from '../../common/normalize';
import type {
  TranscriptInterpreter,
  NluInterpretResult,
} from './transcript.interpreter';
import { TRANSCRIPT_INTERPRETER } from './transcript.interpreter';
import { validatePhone, parseRegions, type PhoneRegion } from './phone';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/**
 * Markers that mean rules-based digit extraction is likely wrong
 * (self-corrections, grouped digits, country codes, heavy filler).
 */
const AMBIGUOUS_RE =
  /\b(no\s+no|nope|sorry|scratch|wait|i\s+mean|actually|double|triple|plus\s+(twenty|nine)|oh\s+no|umm+|uh+|like\s+its?|let\s+me\s+think|لا\s+لا|يعني)\b/i;

@Injectable()
export class NluService {
  private readonly regions: PhoneRegion[];

  constructor(
    @Inject(TRANSCRIPT_INTERPRETER)
    private readonly interpreter: TranscriptInterpreter,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NluService.name);
    this.regions = parseRegions(
      this.config.get('PHONE_REGIONS', { infer: true }),
    );
  }

  get adapterName(): string {
    return this.interpreter.adapterName;
  }

  /**
   * Latency-first interpretation for realtime kiosk sockets.
   * Rules handle yes/no and clean phones instantly; LLM only for messy digit speech.
   * Imperfect digits are OK — AwaitingPhoneConfirm reads them back for the driver.
   */
  async interpret(text: string): Promise<NluInterpretResult> {
    if (!text || !text.trim()) {
      return { text: text || '', normalized: null, digits: null };
    }

    const rules = normalizeTranscript(text);

    // Yes/no only when there isn't a long digit sequence mixed in
    // ("oh no no … two nine nine" must not short-circuit as "no").
    const pureYesNo =
      (rules.normalized === 'yes' || rules.normalized === 'no') &&
      (!rules.digits || rules.digits.length < 7);

    if (pureYesNo) {
      return rules;
    }

    // Clean valid EG/SA number from rules → skip LLM.
    if (rules.digits && !this.looksAmbiguous(text)) {
      const phone = validatePhone(rules.digits, this.regions);
      if (phone.valid && phone.local) {
        return {
          text: rules.text,
          normalized: 'digits',
          digits: phone.local,
        };
      }
    }

    // Rules-only adapter: nothing more to do.
    if (this.interpreter.adapterName === 'rules') {
      return rules;
    }

    // Messy / invalid phone speech → LLM (timeout falls back to rules).
    try {
      const result = await this.interpreter.interpret(text);

      if (result.normalized === 'yes' || result.normalized === 'no') {
        return result;
      }

      if (result.normalized === 'digits' && result.digits) {
        const phoneCheck = validatePhone(result.digits, this.regions);
        if (phoneCheck.valid && phoneCheck.local) {
          return {
            text: result.text,
            normalized: 'digits',
            digits: phoneCheck.local,
          };
        }

        // Prefer rules if they yield a valid phone; else keep LLM digits for confirm.
        if (rules.digits) {
          const rulesPhone = validatePhone(rules.digits, this.regions);
          if (rulesPhone.valid && rulesPhone.local) {
            return {
              text: rules.text,
              normalized: 'digits',
              digits: rulesPhone.local,
            };
          }
        }

        return result;
      }

      if (!result.normalized && rules.normalized) {
        return rules;
      }

      return result;
    } catch (err) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          adapter: this.interpreter.adapterName,
        },
        'nlu.interpret.failed, falling back to rules',
      );
      return rules;
    }
  }

  private looksAmbiguous(text: string): boolean {
    return AMBIGUOUS_RE.test(text);
  }
}
