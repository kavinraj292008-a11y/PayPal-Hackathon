/** Strict, dependency-free validators shared by API schemas. */

export const LIMITS = {
  TITLE_MIN: 3,
  TITLE_MAX: 120,
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 5_000,
  MILESTONES_MIN: 1,
  MILESTONES_MAX: 20,
  CRITERIA_MAX_PER_MILESTONE: 15,
  CRITERION_MIN: 3,
  CRITERION_MAX: 500,
  SUMMARY_MIN: 10,
  SUMMARY_MAX: 2_000,
  NOTES_MAX: 2_000,
  EVIDENCE_MAX: 20_000,
  URL_MAX: 2_048,
  CLIENT_REQUIREMENTS_MAX: 3_000,
  MAX_DEADLINE_HORIZON_DAYS: 5 * 365,
} as const;

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Accepts only absolute http(s) URLs. Rejects javascript:, data:, file:, vbscript:,
 * embedded credentials, control characters and over-long values.
 */
export function validateHttpUrl(input: string): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof input !== 'string') return { ok: false, reason: 'URL must be a string.' };
  const value = input.trim();
  if (value.length === 0) return { ok: false, reason: 'URL is required.' };
  if (value.length > LIMITS.URL_MAX) return { ok: false, reason: `URL must be at most ${LIMITS.URL_MAX} characters.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return { ok: false, reason: 'URL contains invalid characters.' };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'Must be a valid absolute URL.' };
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: 'Only http and https URLs are allowed.' };
  }
  if (!parsed.hostname) return { ok: false, reason: 'URL must include a host.' };
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URLs must not contain embedded credentials.' };
  }
  return { ok: true, url: parsed.toString() };
}

/** Render-time guard (also protects against legacy rows saved before validation existed). */
export function safeHttpHref(input: string | null | undefined): string | null {
  if (!input) return null;
  const r = validateHttpUrl(input);
  return r.ok ? r.url : null;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Strict ISO-8601 parser. Accepts "YYYY-MM-DD" (treated as the END of that day, UTC,
 * so a deadline of "today" is still valid) or a full date-time with an explicit
 * offset. Rejects impossible dates (2026-02-30), loose formats ("next friday",
 * "12/31/2026") and out-of-range years.
 */
export function parseStrictDeadline(input: string): Date | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  let m = DATE_ONLY.exec(value);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 2000 || y > 2100 || !isRealCalendarDate(y, mo, d)) return null;
    return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  }
  m = DATE_TIME.exec(value);
  if (m) {
    const [y, mo, d, hh, mm] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    const ss = m[6] ? Number(m[6]) : 0;
    if (y < 2000 || y > 2100 || !isRealCalendarDate(y, mo, d) || hh > 23 || mm > 59 || ss > 59) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Problems with a deadline relative to "now", or null if acceptable. */
export function deadlineProblem(date: Date, now: Date = new Date()): string | null {
  if (date.getTime() < now.getTime()) return 'Deadline must not be in the past.';
  const horizon = now.getTime() + LIMITS.MAX_DEADLINE_HORIZON_DAYS * 86_400_000;
  if (date.getTime() > horizon) return 'Deadline is too far in the future (max 5 years).';
  return null;
}
