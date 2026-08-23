import { SttService } from './stt.service';
import type { SpeechTranscriber, TranscribeResult } from './speech.transcriber';
import type { NluService } from '../nlu/nlu.service';
import { normalizeTranscript } from '../../common/normalize';

class FakeTranscriber implements SpeechTranscriber {
  readonly adapterName = 'fake';
  response = 'yes';

  async transcribe(): Promise<TranscribeResult> {
    return { text: this.response };
  }
}

function fakeLogger() {
  return {
    setContext: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as any;
}

function fakeNluService(): NluService {
  return {
    adapterName: 'rules',
    interpret: async (text: string) => normalizeTranscript(text),
  } as any;
}

function createService(response = 'yes') {
  const transcriber = new FakeTranscriber();
  transcriber.response = response;
  const service = new SttService(transcriber, fakeNluService(), fakeLogger());
  return { service, transcriber };
}

describe('SttService', () => {
  it('rejects empty audio', async () => {
    const { service } = createService();
    await expect(
      service.transcribe(Buffer.alloc(0), 'clip.webm'),
    ).rejects.toThrow('audio is empty');
  });

  it('normalizes "yes" transcript', async () => {
    const { service } = createService('yes');
    const result = await service.transcribe(Buffer.from('data'), 'clip.webm');
    expect(result.normalized).toBe('yes');
    expect(result.text).toBe('yes');
  });

  it('normalizes "no" transcript', async () => {
    const { service } = createService('no');
    const result = await service.transcribe(Buffer.from('data'), 'clip.webm');
    expect(result.normalized).toBe('no');
  });

  it('extracts digits from transcript', async () => {
    const { service } = createService(
      'zero five zero one two three four five six seven',
    );
    const result = await service.transcribe(Buffer.from('data'), 'clip.webm');
    expect(result.normalized).toBe('digits');
    expect(result.digits).toBe('0501234567');
  });

  it('returns null normalized for unclear text', async () => {
    const { service } = createService('hello world');
    const result = await service.transcribe(Buffer.from('data'), 'clip.webm');
    expect(result.normalized).toBeNull();
    expect(result.digits).toBeNull();
  });

  it('reports adapter name', () => {
    const { service } = createService();
    expect(service.adapterName).toBe('fake');
  });
});
