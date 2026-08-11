export const SPEECH_TRANSCRIBER = Symbol('SPEECH_TRANSCRIBER');

export interface TranscribeResult {
  text: string;
}

export interface SpeechTranscriber {
  transcribe(audioBuffer: Buffer, filename: string, lang?: string): Promise<TranscribeResult>;
  readonly adapterName: string;
}
