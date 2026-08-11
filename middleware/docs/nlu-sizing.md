# NLU sizing — local LLM for STT transcript extraction

Benchmark date: **2026-08-11**  
Corpus: 37 fixtures in `src/modules/nlu/nlu.fixtures.ts`  
Host: Ollama 0.20.7, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_NUM_THREAD=4` (CPU-capped)  
Raw results: [`scripts/nlu-benchmark-results.json`](../scripts/nlu-benchmark-results.json)

## Product constraint (updated)

The gate pipeline **reads digits back and asks the driver to confirm**. We do **not** need 100% extraction accuracy. We **do** need the Socket.io path to stay snappy — multi-second LLM calls on every turn are unacceptable.

## Verdict (latency-first)

| Adapter | Raw accuracy | p50 (4-thread CPU) | Role |
| --- | --- | --- | --- |
| Rules | 43.2% | \<1 ms | Default for yes/no + clean phones |
| `qwen3:0.6b` | 27.0% | ~2.7 s | **Default LLM** when speech looks messy |
| `qwen3:1.7b` | 54.1% | ~6.1 s | Optional quality upgrade **only with GPU** |

**Recommended model: `qwen3:0.6b`**, with a hybrid fast path in `NluService`:

1. **Yes/no** → rules only (instant; never call the LLM)
2. **Clean valid EG/SA digits** → rules only
3. **Messy speech** (corrections, filler, double/triple, country code…) → LLM with `NLU_TIMEOUT_MS=2000`; on timeout/error → rules
4. **Confirm step** covers imperfect digits

Both models correctly handled the key self-correction case (“oh no no … two nine nine”). That is the only class of utterance that *must* hit the LLM.

## Realtime latency budget

| Path | Target | How |
| --- | --- | --- |
| Yes/no / clean phone | \<5 ms | Rules fast path |
| Messy phone + GPU | \<500 ms | `qwen3:0.6b`, thinking off, slim prompt |
| Messy phone + CPU | 2–3 s or timeout→rules | Prefer GPU for production |

Fail-fast timeout (`NLU_TIMEOUT_MS=2000`) keeps sockets from hanging: better a imperfect rules extract + confirm than a 6s stall.

## VPS sketch

| Tier | Spec | Fit |
| --- | --- | --- |
| A — CPU small | 2–4 vCPU | Middleware + Redis; `NLU_ADAPTER=rules` or rare LLM with timeout→rules |
| B — CPU mid | 4–8 vCPU | Can run `0.6b`; expect ~2–3 s on messy turns |
| C — GPU entry | T4/L4 or similar | **Preferred** for interactive kiosk with `NLU_ADAPTER=llm` |

## Enable

```env
NLU_ADAPTER=llm
NLU_BASE_URL=http://127.0.0.1:11434/v1
NLU_MODEL=qwen3:0.6b
NLU_TIMEOUT_MS=2000
PHONE_REGIONS=EG,SA
```

Keep the model warm (`ollama run qwen3:0.6b` once, or a periodic ping) so the first messy utterance after idle does not pay cold-load cost.
