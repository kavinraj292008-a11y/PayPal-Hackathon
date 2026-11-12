/**
 * Privacy-conscious logging. Never pass user-submitted content (evidence, notes,
 * summaries, request bodies, model output) to these helpers: log identifiers,
 * codes, counts and durations only.
 */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
  if (process.env.NODE_ENV === 'test') return;
  const safe: Record<string, unknown> = { event };
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  console.log(JSON.stringify(safe));
}

/** Summarises an error without echoing message text that may contain user data. */
export function describeError(err: unknown): Record<string, string | number | undefined> {
  const e = err as any;
  return {
    name: typeof e?.name === 'string' ? e.name : 'Error',
    code: typeof e?.code === 'string' ? e.code : undefined,
    status: typeof e?.status === 'number' ? e.status : undefined,
  };
}
