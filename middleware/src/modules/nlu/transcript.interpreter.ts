export const TRANSCRIPT_INTERPRETER = Symbol('TRANSCRIPT_INTERPRETER');

export interface NluInterpretResult {
  text: string;
  normalized: 'yes' | 'no' | 'digits' | null;
  digits: string | null;
}

export interface TranscriptInterpreter {
  interpret(text: string): Promise<NluInterpretResult>;
  readonly adapterName: string;
}
