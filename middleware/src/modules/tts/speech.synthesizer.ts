export const SPEECH_SYNTHESIZER = Symbol('SPEECH_SYNTHESIZER');

export interface SynthesizeResult {
  audio: Buffer;
  contentType: string;
}

export interface SpeechSynthesizer {
  synthesize(text: string, lang: string): Promise<SynthesizeResult>;
  readonly adapterName: string;
}
