/**
 * Client-side money helpers. The SERVER is the authority: it validates and stores integer
 * minor units. These helpers exist for display and for converting what the user types into
 * an exact decimal string. No monetary arithmetic uses floating point: all sums are integer
 * minor-unit sums. (Keep EXPONENTS in sync with SUPPORTED_CURRENCIES in shared/src/money.ts.)
 */
const EXPONENTS: Record<string, number> = { USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, SGD: 2, INR: 2, JPY: 0 };

export const SUPPORTED_CURRENCY_CODES = Object.keys(EXPONENTS);

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency] ?? 2;
}

/** Integer minor units -> exact decimal string (e.g. 150000 USD -> "1500.00"). */
export function minorToDecimalString(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(Math.trunc(minor))).padStart(exp + 1, '0');
  const whole = exp === 0 ? digits : digits.slice(0, -exp);
  const frac = exp === 0 ? '' : digits.slice(-exp);
  return `${negative ? '-' : ''}${whole}${exp === 0 ? '' : '.' + frac}`;
}

/**
 * Strictly parse what the user typed into integer minor units.
 * Returns null for anything that is not a plain positive decimal with <= exponent decimals.
 */
export function parseAmountToMinor(input: string | number, currency: string): number | null {
  const text = (typeof input === 'number' ? String(input) : input).trim();
  const exp = currencyExponent(currency);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  if (frac.length > exp) return null;
  const minor = Number(whole + frac.padEnd(exp, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Display only. Uses Intl on the exact decimal string's value; never used for arithmetic. */
export function formatMoney(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const value = Number(minorToDecimalString(minor, currency));
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(value);
  } catch {
    return `${minorToDecimalString(minor, currency)} ${currency}`;
  }
}

/** Exact per-currency totals (integer sums), so different currencies are never added together. */
export function sumByCurrency<T>(
  items: T[],
  pick: (item: T) => { minor: number; currency: string }
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const it of items) {
    const { minor, currency } = pick(it);
    totals[currency] = (totals[currency] ?? 0) + minor;
  }
  return totals;
}

export function formatTotals(totals: Record<string, number>, fallbackCurrency = 'USD'): string {
  const entries = Object.entries(totals);
  if (entries.length === 0) return formatMoney(0, fallbackCurrency);
  return entries.map(([c, m]) => formatMoney(m, c)).join(' + ');
}

/** Render-time guard for user-supplied links. Only http(s) URLs may become an href. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
