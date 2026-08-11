import { Injectable } from '@nestjs/common';
import type { SpeechSynthesizer, SynthesizeResult } from './speech.synthesizer';

/**
 * Minimal silent WAV: 44-byte header + 2 bytes of silence.
 * Good enough for demos and tests without an ElevenLabs key.
 */
function silentWav(): Buffer {
  const numSamples = 1;
  const numChannels = 1;
  const sampleRate = 22050;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const SILENT_WAV = silentWav();

@Injectable()
export class StubTtsAdapter implements SpeechSynthesizer {
  readonly adapterName = 'stub';

  async synthesize(_text: string, _lang: string): Promise<SynthesizeResult> {
    return { audio: SILENT_WAV, contentType: 'audio/wav' };
  }
}
