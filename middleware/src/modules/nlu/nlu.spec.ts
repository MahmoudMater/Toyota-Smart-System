import { normalizeTranscript } from '../../common/normalize';
import { scoreInterpreter, type NluResult } from './nlu.fixtures';
import { validatePhone } from './phone';
import { NluService } from './nlu.service';
import type { TranscriptInterpreter } from './transcript.interpreter';

describe('NLU — rules baseline', () => {
  it('scores the rules-based normalizeTranscript against the eval corpus', () => {
    const score = scoreInterpreter((text) => normalizeTranscript(text));

    // Log for visibility during benchmark comparisons
    console.log(
      `Rules baseline: ${score.correct}/${score.total} (${(score.accuracy * 100).toFixed(1)}%)`,
    );
    if (score.failures.length) {
      console.log('Failures:');
      for (const f of score.failures) {
        console.log(
          `  ${f.id}: expected ${JSON.stringify(f.expected)}, got ${JSON.stringify({ normalized: f.got.normalized, digits: f.got.digits })}`,
        );
      }
    }

    // The rules baseline is expected to fail on correction/group/country-code cases.
    // This test documents the baseline, not enforces perfection.
    expect(score.total).toBeGreaterThan(0);
    expect(score.accuracy).toBeGreaterThan(0);
  });
});

describe('NluService latency fast-path', () => {
  function makeService(interpreter: TranscriptInterpreter) {
    const config = {
      get: (key: string) => (key === 'PHONE_REGIONS' ? 'EG,SA' : undefined),
    } as any;
    const logger = {
      setContext: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    } as any;
    return new NluService(interpreter, config, logger);
  }

  it('never calls the LLM for yes/no', async () => {
    const interpret = jest.fn(async () => {
      throw new Error('LLM should not be called');
    });
    const service = makeService({
      adapterName: 'llm',
      interpret,
    });

    const yes = await service.interpret('yeah I guess so');
    const no = await service.interpret('no');
    expect(yes.normalized).toBe('yes');
    expect(no.normalized).toBe('no');
    expect(interpret).not.toHaveBeenCalled();
  });

  it('skips LLM for a clean spoken Saudi number', async () => {
    const interpret = jest.fn(async () => {
      throw new Error('LLM should not be called');
    });
    const service = makeService({
      adapterName: 'llm',
      interpret,
    });

    const result = await service.interpret(
      'zero five zero one two three four five six seven',
    );
    expect(result.normalized).toBe('digits');
    expect(result.digits).toBe('0501234567');
    expect(interpret).not.toHaveBeenCalled();
  });

  it('calls LLM for self-correction speech', async () => {
    const interpret = jest.fn(async () => ({
      text: 'x',
      normalized: 'digits' as const,
      digits: '01555032099',
    }));
    const service = makeService({
      adapterName: 'llm',
      interpret,
    });

    const result = await service.interpret(
      'ummm my phone number is zero one five five five zero three oh no no two nine nine',
    );
    expect(interpret).toHaveBeenCalled();
    expect(result.digits).toBe('01555032099');
  });
});

describe('Phone validation', () => {
  it('accepts valid Egyptian numbers', () => {
    expect(validatePhone('01012345678', ['EG'])).toEqual({
      valid: true,
      region: 'EG',
      local: '01012345678',
    });
    expect(validatePhone('01512345678', ['EG'])).toEqual({
      valid: true,
      region: 'EG',
      local: '01512345678',
    });
  });

  it('accepts valid Saudi numbers', () => {
    expect(validatePhone('0501234567', ['SA'])).toEqual({
      valid: true,
      region: 'SA',
      local: '0501234567',
    });
    expect(validatePhone('0555123456', ['SA'])).toEqual({
      valid: true,
      region: 'SA',
      local: '0555123456',
    });
  });

  it('strips +20 country code', () => {
    expect(validatePhone('201012345678', ['EG'])).toEqual({
      valid: true,
      region: 'EG',
      local: '01012345678',
    });
  });

  it('strips +966 country code', () => {
    expect(validatePhone('966501234567', ['SA'])).toEqual({
      valid: true,
      region: 'SA',
      local: '0501234567',
    });
  });

  it('strips 00966 country code', () => {
    expect(validatePhone('00966501234567', ['SA'])).toEqual({
      valid: true,
      region: 'SA',
      local: '0501234567',
    });
  });

  it('rejects invalid prefix', () => {
    expect(validatePhone('01312345678', ['EG']).valid).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(validatePhone('010123456', ['EG']).valid).toBe(false);
    expect(validatePhone('050123456', ['SA']).valid).toBe(false);
  });

  it('auto-detects region when both enabled', () => {
    const eg = validatePhone('01012345678', ['EG', 'SA']);
    expect(eg).toEqual({ valid: true, region: 'EG', local: '01012345678' });

    const sa = validatePhone('0501234567', ['EG', 'SA']);
    expect(sa).toEqual({ valid: true, region: 'SA', local: '0501234567' });
  });
});
