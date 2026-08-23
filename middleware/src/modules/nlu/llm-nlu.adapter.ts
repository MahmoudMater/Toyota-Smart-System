import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.validation';
import { normalizeTranscript } from '../../common/normalize';
import { IntegrationLogService } from '../integration-log/integration-log.service';
import type {
  TranscriptInterpreter,
  NluInterpretResult,
} from './transcript.interpreter';
import { NLU_SYSTEM_PROMPT, NLU_FEW_SHOT, NLU_JSON_SCHEMA } from './prompt';

interface LlmResponse {
  intent: 'yes' | 'no' | 'digits' | null;
  digits: string | null;
}

@Injectable()
export class LlmNluAdapter implements TranscriptInterpreter {
  readonly adapterName = 'llm';

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
    private readonly integrationLog: IntegrationLogService,
  ) {
    this.logger.setContext(LlmNluAdapter.name);
    this.baseUrl = this.config.get('NLU_BASE_URL', { infer: true });
    this.model = this.config.get('NLU_MODEL', { infer: true });
    this.apiKey = this.config.get('NLU_API_KEY', { infer: true });
    this.timeoutMs = this.config.get('NLU_TIMEOUT_MS', { infer: true });
  }

  async interpret(text: string): Promise<NluInterpretResult> {
    // Prefer Ollama native /api/chat when pointing at Ollama — think:false works there.
    // Otherwise use OpenAI-compat with every known "disable thinking" knob.
    const base = this.baseUrl.replace(/\/+$/, '');
    const isOllamaV1 = /:11434\/v1$/i.test(base) || base.endsWith('/v1');

    if (isOllamaV1) {
      return this.interpretViaOllamaNative(text, base.replace(/\/v1$/i, ''));
    }
    return this.interpretViaOpenAiCompat(text, base);
  }

  private async interpretViaOllamaNative(
    text: string,
    root: string,
  ): Promise<NluInterpretResult> {
    const messages = [
      { role: 'system' as const, content: NLU_SYSTEM_PROMPT },
      ...NLU_FEW_SHOT,
      { role: 'user' as const, content: `/no_think\n${text}` },
    ];

    const url = `${root}/api/chat`;
    const call = this.integrationLog.startCall({
      integration: 'nlu',
      op: 'nlu.llm.ollama_native',
      method: 'POST',
      url,
      request: { model: this.model, text, timeoutMs: this.timeoutMs },
    });

    try {
      const res = await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0, num_predict: 48 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        call.failure({
          status: res.status,
          error: `LLM API ${res.status}`,
          body: errText.slice(0, 200),
        });
        throw new Error(`LLM API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json = (await res.json()) as { message?: { content?: string } };
      const content = json.message?.content;
      if (!content) {
        call.failure({
          status: res.status,
          error: 'LLM returned empty content',
        });
        throw new Error('LLM returned empty content');
      }
      const result = this.toNluResult(text, this.parseResponse(content));
      call.success({
        status: res.status,
        response: {
          raw: content,
          intent: result.normalized,
          digits: result.digits,
        },
      });
      return result;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('LLM API')) throw err;
      if (
        err instanceof Error &&
        err.message === 'LLM returned empty content'
      ) {
        throw err;
      }
      call.failure({
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async interpretViaOpenAiCompat(
    text: string,
    base: string,
  ): Promise<NluInterpretResult> {
    const messages = [
      { role: 'system' as const, content: NLU_SYSTEM_PROMPT },
      ...NLU_FEW_SHOT,
      { role: 'user' as const, content: `/no_think\n${text}` },
    ];

    // Multiple knobs: different servers honor different ones for Qwen3.
    const body = {
      model: this.model,
      messages,
      temperature: 0,
      max_tokens: 48,
      think: false,
      reasoning_effort: 'none',
      chat_template_kwargs: { enable_thinking: false },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'nlu_result',
          strict: true,
          schema: NLU_JSON_SCHEMA,
        },
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const url = `${base}/chat/completions`;
    const call = this.integrationLog.startCall({
      integration: 'nlu',
      op: 'nlu.llm.openai_compat',
      method: 'POST',
      url,
      request: { model: this.model, text, timeoutMs: this.timeoutMs },
    });

    try {
      const res = await globalThis.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        call.failure({
          status: res.status,
          error: `LLM API ${res.status}`,
          body: errText.slice(0, 200),
        });
        throw new Error(`LLM API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        call.failure({
          status: res.status,
          error: 'LLM returned empty content',
        });
        throw new Error('LLM returned empty content');
      }
      const result = this.toNluResult(text, this.parseResponse(content));
      call.success({
        status: res.status,
        response: {
          raw: content,
          intent: result.normalized,
          digits: result.digits,
        },
      });
      return result;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('LLM API')) throw err;
      if (
        err instanceof Error &&
        err.message === 'LLM returned empty content'
      ) {
        throw err;
      }
      call.failure({
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private parseResponse(content: string): LlmResponse {
    let cleaned = content.trim();
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/<\/?think>/gi, '').trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const intent = obj.intent;
    const digits = obj.digits;

    if (
      intent !== 'yes' &&
      intent !== 'no' &&
      intent !== 'digits' &&
      intent !== null
    ) {
      throw new Error(`Unexpected intent: ${String(intent)}`);
    }

    return {
      intent: intent,
      digits: typeof digits === 'string' ? digits.replace(/\D/g, '') : null,
    };
  }

  private toNluResult(
    originalText: string,
    parsed: LlmResponse,
  ): NluInterpretResult {
    if (parsed.intent === 'yes' || parsed.intent === 'no') {
      return { text: originalText, normalized: parsed.intent, digits: null };
    }

    if (parsed.intent === 'digits' && parsed.digits) {
      return {
        text: originalText,
        normalized: 'digits',
        digits: parsed.digits,
      };
    }

    // LLM returned null or digits without actual digits — fall back to rules
    return normalizeTranscript(originalText);
  }
}
