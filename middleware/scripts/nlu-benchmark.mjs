#!/usr/bin/env node
/**
 * NLU model bake-off against the eval corpus.
 *
 * Usage:
 *   node scripts/nlu-benchmark.mjs
 *   NLU_BASE_URL=http://127.0.0.1:11434/v1 node scripts/nlu-benchmark.mjs
 *
 * Expects Ollama (or any OpenAI-compatible server) already running with:
 *   ollama pull qwen3:0.6b
 *   ollama pull qwen3:1.7b
 *
 * Writes JSON results to scripts/nlu-benchmark-results.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE_URL = (process.env.NLU_BASE_URL || 'http://127.0.0.1:11434/v1').replace(
  /\/+$/,
  '',
);
// First-load + CPU can take a while; thinking-off responses are fast after warm-up.
const TIMEOUT_MS = Number(process.env.NLU_TIMEOUT_MS || 120000);
const OLLAMA_ROOT = BASE_URL.replace(/\/v1\/?$/, '');
const MODELS = (process.env.NLU_BENCHMARK_MODELS || 'qwen3:0.6b,qwen3:1.7b')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SYSTEM_PROMPT = `You are a structured extraction engine for a kiosk voice system. Your job is to interpret raw speech-to-text transcripts and extract the user's intent.

RULES:
1. If the user is saying a phone number (digits spoken as words or numerals), extract ONLY the digits they intend as their final answer.
2. Handle self-corrections: if the speaker says "no no" or "wait" or "sorry" or "I mean" or equivalent Arabic, they are retracting previous digits. Use context to determine which digits to keep.
3. "oh" before or between digits means zero. "oh" at the start of a sentence before non-digit words is an interjection — ignore it.
4. "double X" means XX. "triple X" means XXX.
5. Strip international prefixes: +20, 0020 → Egyptian local (keep leading 0); +966, 00966 → Saudi local (keep leading 0).
6. If the user is saying "yes", "yeah", "sure", "ok", "نعم", "ايوه", "تمام", or similar → intent is "yes".
7. If the user is saying "no", "nope", "لا", "مش", or similar → intent is "no".
8. If you cannot determine any intent, return null for both fields.

Respond with ONLY a JSON object, no extra text.
Empty input or nonsense → {"intent":null,"digits":null}.
Never invent digits from the few-shot examples.`;

const FEW_SHOT = [
  {
    role: 'user',
    content:
      'ummm my phone number is zero one five five five zero three oh no no two nine nine',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"01555032099"}',
  },
  {
    role: 'user',
    content: 'zero five five five one two no sorry one three four five six seven',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"0555134567"}',
  },
  {
    role: 'user',
    content: 'plus nine six six five zero one two three four five six seven',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"0501234567"}',
  },
  {
    role: 'user',
    content: 'plus twenty one zero one two three four five six seven eight',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"01012345678"}',
  },
  {
    role: 'user',
    content: 'yeah I guess so',
  },
  {
    role: 'assistant',
    content: '{"intent":"yes","digits":null}',
  },
  {
    role: 'user',
    content: 'لا مش صح',
  },
  {
    role: 'assistant',
    content: '{"intent":"no","digits":null}',
  },
  {
    role: 'user',
    content:
      'oh the number is zero one zero double one two three four five six seven',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"01011234567"}',
  },
];

/** Minimal fixture parse — keeps this script free of TS/Jest deps. */
function loadFixtures() {
  const src = readFileSync(
    join(ROOT, 'src/modules/nlu/nlu.fixtures.ts'),
    'utf8',
  );
  // Extract the NLU_FIXTURES array body by evaluating a stripped copy.
  // Safer: hand-parse id/input/expected with a simple regex walk.
  const fixtures = [];
  const blockRe =
    /\{\s*id:\s*'([^']+)',\s*input:\s*'((?:\\'|[^'])*)',\s*expected:\s*\{\s*normalized:\s*'([^']+)'\s*\|\s*null|normalized:\s*(null|'[^']+'),\s*digits:\s*(null|'[^']+')/gs;

  // Fallback: use a JSON sidecar if present, else eval via Function after light transform
  const jsonPath = join(ROOT, 'scripts/nlu-fixtures.json');
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    // transform TS export to JSON-ish via Function
  }

  // Strip TypeScript-only syntax and evaluate
  let body = src
    .replace(/^[\s\S]*?export const NLU_FIXTURES[^=]*=\s*/, '')
    .replace(/;\s*export[\s\S]*$/, '')
    .replace(/;\s*$/, '');
  // Remove type annotations in expected objects already pure JS-like
  try {
    // eslint-disable-next-line no-new-func
    const arr = Function(`"use strict"; return (${body});`)();
    return arr;
  } catch (err) {
    console.error('Failed to load fixtures from TS. Write scripts/nlu-fixtures.json instead.');
    console.error(err);
    process.exit(1);
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function stripToJson(content) {
  let cleaned = (content || '').trim();
  // Strip Qwen thinking / reasoning blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/<\/?think>/gi, '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Use Ollama *native* /api/chat with top-level think:false.
 * OpenAI-compat /v1 ignores think and Qwen3 burns max_tokens on thinking → empty content.
 */
async function callModel(model, text) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...FEW_SHOT,
    // /no_think is a second belt for Qwen chat templates
    { role: 'user', content: `/no_think\n${text}` },
  ];

  const body = {
    model,
    messages,
    stream: false,
    think: false,
    format: 'json',
    options: {
      temperature: 0,
      num_predict: 128,
    },
  };

  const t0 = performance.now();
  const res = await fetch(`${OLLAMA_ROOT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const elapsedMs = performance.now() - t0;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json.message?.content ?? '';
  const promptTokens = json.prompt_eval_count ?? 0;
  const completionTokens = json.eval_count ?? 0;

  const cleaned = stripToJson(content);
  if (!cleaned) {
    throw new Error(
      `Empty content (thinking likely still on). raw=${JSON.stringify(content).slice(0, 160)}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Unparseable: ${cleaned.slice(0, 160)}`);
    parsed = JSON.parse(m[0]);
  }

  return {
    elapsedMs,
    promptTokens,
    completionTokens,
    intent: parsed.intent ?? null,
    digits:
      typeof parsed.digits === 'string'
        ? parsed.digits.replace(/\D/g, '')
        : null,
    raw: content,
  };
}

async function warmUp(model) {
  console.log(`  warming up ${model}...`);
  try {
    await callModel(model, 'yes');
  } catch (err) {
    console.warn(`  warmup failed: ${err.message}`);
  }
}

async function evaluate(model, fixtures) {
  await warmUp(model);

  let correct = 0;
  const latencies = [];
  const failures = [];
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalMs = 0;

  for (const f of fixtures) {
    process.stdout.write(`  [${model}] ${f.id}... `);
    try {
      const got = await callModel(model, f.input);
      latencies.push(got.elapsedMs);
      totalMs += got.elapsedMs;
      totalPrompt += got.promptTokens;
      totalCompletion += got.completionTokens;

      const normOk = got.intent === f.expected.normalized;
      const digitsOk = (got.digits || null) === f.expected.digits;
      if (normOk && digitsOk) {
        correct++;
        console.log(`OK (${got.elapsedMs.toFixed(0)}ms)`);
      } else {
        failures.push({
          id: f.id,
          expected: f.expected,
          got: { intent: got.intent, digits: got.digits },
        });
        console.log(
          `FAIL (${got.elapsedMs.toFixed(0)}ms) expected=${JSON.stringify(f.expected)} got=${JSON.stringify({ intent: got.intent, digits: got.digits })}`,
        );
      }
    } catch (err) {
      failures.push({ id: f.id, error: err.message });
      console.log(`ERR ${err.message}`);
    }
  }

  latencies.sort((a, b) => a - b);
  const toksPerSec =
    totalMs > 0 ? (totalCompletion / (totalMs / 1000)).toFixed(1) : '0';

  return {
    model,
    total: fixtures.length,
    correct,
    accuracy: fixtures.length ? correct / fixtures.length : 0,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    meanMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    completionTokensPerSec: Number(toksPerSec),
    totalPromptTokens: totalPrompt,
    totalCompletionTokens: totalCompletion,
    failures,
  };
}

async function main() {
  console.log(`NLU benchmark`);
  console.log(`  base URL: ${BASE_URL}`);
  console.log(`  models:   ${MODELS.join(', ')}`);
  console.log(`  timeout:  ${TIMEOUT_MS}ms`);
  console.log();

  // Health check
  try {
    const health = await fetch(`${OLLAMA_ROOT}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) throw new Error(`status ${health.status}`);
    const tags = await health.json();
    const names = (tags.models || []).map((m) => m.name);
    console.log(`Ollama models available: ${names.join(', ') || '(none)'}`);
    for (const m of MODELS) {
      if (!names.some((n) => n === m || n.startsWith(m + ':'))) {
        console.warn(`  WARNING: ${m} not found — pull it first: ollama pull ${m}`);
      }
    }
    console.log();
  } catch (err) {
    console.error(`Cannot reach Ollama at ${BASE_URL}: ${err.message}`);
    console.error('Start it with: ollama serve');
    process.exit(1);
  }

  const fixtures = loadFixtures();
  console.log(`Fixtures: ${fixtures.length}`);
  console.log();

  const results = [];
  for (const model of MODELS) {
    console.log(`=== ${model} ===`);
    const r = await evaluate(model, fixtures);
    results.push(r);
    console.log(
      `  accuracy ${r.correct}/${r.total} (${(r.accuracy * 100).toFixed(1)}%)  p50=${r.p50Ms}ms  p95=${r.p95Ms}ms  tok/s=${r.completionTokensPerSec}`,
    );
    console.log();
  }

  const out = {
    ranAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    cpuNote:
      'Set OLLAMA_NUM_PARALLEL=1 OLLAMA_NUM_THREAD=4 on the *ollama serve* process (not the node client) for VPS-like CPU sizing. Uses native /api/chat with think:false.',
    results,
  };

  const outPath = join(__dirname, 'nlu-benchmark-results.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);

  // Summary table
  console.log('\nSummary');
  console.log('Model          Acc%    p50ms   p95ms   tok/s');
  for (const r of results) {
    console.log(
      `${r.model.padEnd(14)} ${(r.accuracy * 100).toFixed(1).padStart(5)}  ${String(r.p50Ms).padStart(6)}  ${String(r.p95Ms).padStart(6)}  ${String(r.completionTokensPerSec).padStart(5)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
