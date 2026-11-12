/**
 * Single source of truth for AI configuration. Read from process.env at call
 * time (no cached/mutable module state), with hard bounds on every knob.
 */
const clampInt = (raw: string | undefined, def: number, min: number, max: number) => {
  const n = raw === undefined || raw === '' ? def : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};

export interface AiConfig {
  model: string;
  fallbackModels: string[];
  timeoutMs: number;
  maxAttempts: number;
  maxConcurrentCalls: number;
}

export function getAiConfig(): AiConfig {
  const model = (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
  const fallbackRaw =
    process.env.GEMINI_FALLBACK_MODELS !== undefined
      ? process.env.GEMINI_FALLBACK_MODELS
      : 'gemini-3.5-flash-lite,gemini-3.1-flash-lite';
  const fallbackModels = fallbackRaw
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m && m !== model);
  return {
    model,
    fallbackModels,
    timeoutMs: clampInt(process.env.GEMINI_TIMEOUT_MS, 30_000, 1_000, 120_000),
    maxAttempts: clampInt(process.env.GEMINI_MAX_ATTEMPTS, 3, 1, 4),
    maxConcurrentCalls: clampInt(process.env.AI_MAX_CONCURRENT_CALLS, 3, 1, 20),
  };
}
