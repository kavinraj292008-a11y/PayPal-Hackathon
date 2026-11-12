/**
 * Money handling for ProofPay.
 *
 * Representation: INTEGER MINOR UNITS (cents / paise / yen) everywhere on the
 * server and in the database. No monetary arithmetic is ever done with
 * floating-point numbers.
 *
 * Decimal strings ("1500.00") are used only at the edges: API input, API
 * output and (later) PayPal, which expects an amount value formatted as a
 * decimal string with the currency's exponent.
 */

/** Explicit whitelist. exponent = number of minor-unit decimal places. */
export const SUPPORTED_CURRENCIES = {
  USD: { exponent: 2, symbol: '$' },
  EUR: { exponent: 2, symbol: '€' },
  GBP: { exponent: 2, symbol: '£' },
  CAD: { exponent: 2, symbol: 'CA$' },
  AUD: { exponent: 2, symbol: 'A$' },
  SGD: { exponent: 2, symbol: 'S$' },
  INR: { exponent: 2, symbol: '₹' },
  JPY: { exponent: 0, symbol: '¥' },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;
export const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES) as CurrencyCode[];

/** Largest single amount accepted: 10,000,000.00 (fits a 32-bit INTEGER column in minor units for 2-exponent currencies). */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCIES, value);
}

export function currencyExponent(currency: CurrencyCode): number {
  return SUPPORTED_CURRENCIES[currency].exponent;
}

export class MoneyError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_FORMAT'
      | 'TOO_MANY_DECIMALS'
      | 'NOT_POSITIVE'
      | 'TOO_LARGE'
      | 'UNSUPPORTED_CURRENCY'
      | 'NOT_INTEGER',
    message: string
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Parse a user/API supplied decimal amount into integer minor units.
 *
 * Accepts a decimal string ("1500", "1500.5", "1500.50") or a JS number whose
 * shortest decimal representation is valid. Rejects: exponent notation, signs,
 * thousands separators, more decimals than the currency allows (so 0.1+0.2 =
 * 0.30000000000000004 is rejected rather than silently rounded), zero,
 * negatives and values above MAX_AMOUNT_MINOR.
 */
export function parseDecimalToMinor(input: string | number, currency: CurrencyCode): number {
  if (!isSupportedCurrency(currency)) {
    throw new MoneyError('UNSUPPORTED_CURRENCY', `Unsupported currency: ${String(currency)}`);
  }
  if (typeof input === 'number' && !Number.isFinite(input)) {
    throw new MoneyError('INVALID_FORMAT', 'Amount must be a finite number.');
  }
  const text = typeof input === 'number' ? String(input) : input;
  if (typeof text !== 'string') {
    throw new MoneyError('INVALID_FORMAT', 'Amount must be a string or number.');
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('-')) {
    throw new MoneyError('NOT_POSITIVE', 'Amount must be greater than zero.');
  }
  const exp = currencyExponent(currency);
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError('INVALID_FORMAT', 'Amount must be a plain decimal number such as 1500.00.');
  }
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > exp) {
    throw new MoneyError(
      'TOO_MANY_DECIMALS',
      exp === 0
        ? `${currency} amounts cannot have decimals.`
        : `${currency} amounts allow at most ${exp} decimal places.`
    );
  }
  if (whole.replace(/^0+/, '').length > 12) {
    throw new MoneyError('TOO_LARGE', 'Amount is too large.');
  }
  const minor = Number(whole + frac.padEnd(exp, '0'));
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError('TOO_LARGE', 'Amount is too large.');
  }
  if (minor <= 0) {
    throw new MoneyError('NOT_POSITIVE', 'Amount must be greater than zero.');
  }
  if (minor > MAX_AMOUNT_MINOR) {
    throw new MoneyError('TOO_LARGE', `Amount exceeds the maximum of ${minorToDecimalString(MAX_AMOUNT_MINOR, currency)} ${currency}.`);
  }
  return minor;
}

/**
 * Integer minor units -> decimal string with exactly `exponent` decimals.
 * This is the format PayPal's `amount.value` requires (e.g. "1500.00", JPY "1500").
 */
export function minorToDecimalString(minor: number, currency: CurrencyCode): string {
  if (!isSupportedCurrency(currency)) {
    throw new MoneyError('UNSUPPORTED_CURRENCY', `Unsupported currency: ${String(currency)}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new MoneyError('NOT_INTEGER', 'Minor-unit amounts must be safe integers.');
  }
  const exp = currencyExponent(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exp + 1, '0');
  const whole = exp === 0 ? digits : digits.slice(0, -exp);
  const frac = exp === 0 ? '' : digits.slice(-exp);
  return `${negative ? '-' : ''}${whole}${exp === 0 ? '' : '.' + frac}`;
}

/** Exact integer sum. Throws if any input is not a safe integer. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new MoneyError('NOT_INTEGER', 'Minor-unit amounts must be safe integers.');
    total += v;
    if (!Number.isSafeInteger(total)) throw new MoneyError('TOO_LARGE', 'Sum is too large.');
  }
  return total;
}

/**
 * Split `totalMinor` across integer weights using the largest-remainder method,
 * so the parts are exact integers that sum to exactly `totalMinor`.
 * Every part is at least 1 minor unit (throws when impossible).
 */
export function allocateByWeights(totalMinor: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new MoneyError('NOT_POSITIVE', 'Total must be a positive integer.');
  }
  if (weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w <= 0)) {
    throw new MoneyError('INVALID_FORMAT', 'Weights must be positive integers.');
  }
  if (totalMinor < weights.length) {
    throw new MoneyError('NOT_POSITIVE', 'Total is too small to give every part at least one minor unit.');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  // Reserve 1 unit for every part, distribute the rest proportionally.
  const distributable = totalMinor - weights.length;
  const base = weights.map((w) => Math.floor((distributable * w) / weightSum));
  let remainder = distributable - base.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, frac: (distributable * w) % weightSum }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k++, remainder--) {
    base[order[k % order.length].i] += 1;
  }
  return base.map((b) => b + 1);
}
