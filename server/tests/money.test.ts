import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateProjectSchema,
  MAX_AMOUNT_MINOR,
  MoneyError,
  allocateByWeights,
  minorToDecimalString,
  parseDecimalToMinor,
  sumMinor,
} from '@proofpay/shared';

const throwsCode = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: any) => e instanceof MoneyError && e.code === code, `expected MoneyError ${code}`);

describe('Money: decimal <-> integer minor units', () => {
  it('parses exact decimals without floating-point drift', () => {
    assert.equal(parseDecimalToMinor('1500', 'USD'), 150000);
    assert.equal(parseDecimalToMinor('1500.5', 'USD'), 150050);
    assert.equal(parseDecimalToMinor('19.99', 'USD'), 1999);
    assert.equal(parseDecimalToMinor('0.01', 'USD'), 1);
    assert.equal(parseDecimalToMinor(19.99, 'USD'), 1999); // JS number 19.99 -> shortest decimal "19.99"
    assert.equal(parseDecimalToMinor(0.1, 'USD') + parseDecimalToMinor(0.2, 'USD'), parseDecimalToMinor(0.3, 'USD'));
    assert.equal(parseDecimalToMinor('1.10', 'USD') * 3, 330); // 1.1 * 3 in floats is 3.3000000000000003
  });

  it('rejects floating-point artefacts and silent rounding', () => {
    throwsCode(() => parseDecimalToMinor(0.1 + 0.2, 'USD'), 'TOO_MANY_DECIMALS'); // 0.30000000000000004
    throwsCode(() => parseDecimalToMinor('1.005', 'USD'), 'TOO_MANY_DECIMALS');
    throwsCode(() => parseDecimalToMinor('10.999', 'EUR'), 'TOO_MANY_DECIMALS');
  });

  it('rejects invalid, negative, zero and oversized amounts', () => {
    throwsCode(() => parseDecimalToMinor('-5', 'USD'), 'NOT_POSITIVE');
    throwsCode(() => parseDecimalToMinor(-0.01, 'USD'), 'NOT_POSITIVE');
    throwsCode(() => parseDecimalToMinor('0', 'USD'), 'NOT_POSITIVE');
    throwsCode(() => parseDecimalToMinor('0.00', 'USD'), 'NOT_POSITIVE');
    for (const bad of ['', ' ', 'abc', '1e3', '1,000', '$5', '5.', '.5', '1 000', '+5', '0x10', 'NaN', 'Infinity']) {
      throwsCode(() => parseDecimalToMinor(bad, 'USD'), 'INVALID_FORMAT');
    }
    throwsCode(() => parseDecimalToMinor(NaN, 'USD'), 'INVALID_FORMAT');
    throwsCode(() => parseDecimalToMinor(Infinity, 'USD'), 'INVALID_FORMAT');
    throwsCode(() => parseDecimalToMinor(1e21, 'USD'), 'INVALID_FORMAT'); // exponent notation
    throwsCode(() => parseDecimalToMinor('10000000.01', 'USD'), 'TOO_LARGE');
    throwsCode(() => parseDecimalToMinor('99999999999999999999', 'USD'), 'TOO_LARGE');
    assert.equal(parseDecimalToMinor('10000000.00', 'USD'), MAX_AMOUNT_MINOR);
  });

  it('enforces an explicit currency whitelist and per-currency exponents', () => {
    throwsCode(() => parseDecimalToMinor('5', 'XYZ' as any), 'UNSUPPORTED_CURRENCY');
    throwsCode(() => parseDecimalToMinor('5', 'usd' as any), 'UNSUPPORTED_CURRENCY');
    assert.equal(parseDecimalToMinor('1500', 'JPY'), 1500); // exponent 0
    throwsCode(() => parseDecimalToMinor('1500.5', 'JPY'), 'TOO_MANY_DECIMALS');
    assert.equal(parseDecimalToMinor('2500.75', 'INR'), 250075);
  });

  it('formats minor units as PayPal-compatible decimal strings', () => {
    assert.equal(minorToDecimalString(150000, 'USD'), '1500.00');
    assert.equal(minorToDecimalString(5, 'USD'), '0.05');
    assert.equal(minorToDecimalString(0, 'USD'), '0.00');
    assert.equal(minorToDecimalString(1999, 'EUR'), '19.99');
    assert.equal(minorToDecimalString(1500, 'JPY'), '1500');
    assert.equal(minorToDecimalString(100000000, 'GBP'), '1000000.00');
    throwsCode(() => minorToDecimalString(1.5, 'USD'), 'NOT_INTEGER');
    throwsCode(() => minorToDecimalString(10, 'ABC' as any), 'UNSUPPORTED_CURRENCY');
  });

  it('round-trips every value in a sweep', () => {
    for (let minor = 1; minor <= 20000; minor += 7) {
      assert.equal(parseDecimalToMinor(minorToDecimalString(minor, 'USD'), 'USD'), minor);
    }
    for (const minor of [1, 99, 100, 101, 999999999, MAX_AMOUNT_MINOR]) {
      assert.equal(parseDecimalToMinor(minorToDecimalString(minor, 'INR'), 'INR'), minor);
    }
  });
});

describe('Money: exact sums and allocation', () => {
  it('sums integers exactly (floats would drift)', () => {
    assert.equal(0.1 + 0.2 === 0.3, false); // demonstrates the problem we avoid
    assert.equal(sumMinor([10, 20]), 30);
    assert.equal(sumMinor(new Array(1000).fill(10)), 10000);
    throwsCode(() => sumMinor([1, 1.5]), 'NOT_INTEGER');
  });

  it('allocates by weights so parts ALWAYS sum exactly to the total', () => {
    assert.deepEqual(allocateByWeights(10000, [33, 33, 34]), [3300, 3300, 3400]);
    const odd = allocateByWeights(100, [1, 1, 1]);
    assert.equal(sumMinor(odd), 100);
    assert.deepEqual([...odd].sort(), [33, 33, 34]);
    // deterministic pseudo-random sweep (LCG)
    let seed = 12345;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n) + 1;
    for (let i = 0; i < 500; i++) {
      const parts = rnd(8) + 1;
      const weights = Array.from({ length: parts }, () => rnd(100));
      const total = rnd(MAX_AMOUNT_MINOR - parts) + parts;
      const out = allocateByWeights(total, weights);
      assert.equal(out.length, parts);
      assert.equal(sumMinor(out), total, `total=${total} weights=${weights}`);
      assert.ok(out.every((x) => Number.isInteger(x) && x >= 1));
    }
  });

  it('refuses allocations that cannot give every part one minor unit', () => {
    throwsCode(() => allocateByWeights(2, [1, 1, 1]), 'NOT_POSITIVE');
    throwsCode(() => allocateByWeights(100, [1, 0]), 'INVALID_FORMAT');
  });
});

const baseMilestone = (amount: string | number, extra: Record<string, unknown> = {}) => ({
  title: 'Milestone',
  description: 'Describes the milestone',
  amount,
  acceptanceCriteria: ['Does the thing properly'],
  ...extra,
});
const baseProject = (over: Record<string, unknown> = {}) => ({
  title: 'Project',
  description: 'A sufficiently long description',
  totalBudget: '100.00',
  currency: 'USD',
  milestones: [baseMilestone('33.33'), baseMilestone('33.33'), baseMilestone('33.34')],
  ...over,
});
const issues = (input: unknown) => {
  const r = CreateProjectSchema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('Shared CreateProjectSchema: server-side financial validation', () => {
  it('accepts an exact budget split and returns integer minor units', () => {
    const r = CreateProjectSchema.parse(baseProject());
    assert.equal(r.totalBudgetMinor, 10000);
    assert.deepEqual(r.milestones.map((m) => m.amountMinor), [3333, 3333, 3334]);
    assert.equal(sumMinor(r.milestones.map((m) => m.amountMinor)), r.totalBudgetMinor);
  });

  it('rejects any budget mismatch, even by one minor unit', () => {
    const off = issues(baseProject({ milestones: [baseMilestone('33.33'), baseMilestone('33.33'), baseMilestone('33.33')] }));
    assert.ok(off?.some((m) => m.includes('add up exactly')), String(off));
    assert.ok(issues(baseProject({ totalBudget: '100.01' })));
  });

  it('rejects negative, zero, malformed and unsupported-currency input', () => {
    assert.ok(issues(baseProject({ milestones: [baseMilestone('-10'), baseMilestone('110')] })));
    assert.ok(issues(baseProject({ milestones: [baseMilestone('0'), baseMilestone('100')] })));
    assert.ok(issues(baseProject({ totalBudget: 'lots' })));
    assert.ok(issues(baseProject({ currency: 'XYZ' })));
    assert.ok(issues(baseProject({ currency: 'usd' })));
    assert.ok(issues(baseProject({ milestones: [baseMilestone('50', { currency: 'EUR' }), baseMilestone('50')] })));
  });

  it('rejects unexpected fields (strict) and empty/oversized collections', () => {
    assert.ok(issues({ ...baseProject(), clientId: 'attacker' }));
    assert.ok(issues({ ...baseProject(), isAdmin: true }));
    assert.ok(issues(baseProject({ milestones: [] })));
    assert.ok(issues(baseProject({ milestones: Array.from({ length: 21 }, () => baseMilestone('1')) , totalBudget: '21'})));
    assert.ok(issues(baseProject({ milestones: [baseMilestone('100', { acceptanceCriteria: [] })] })));
  });

  it('validates dates and keeps milestone deadlines within the project deadline', () => {
    assert.ok(issues(baseProject({ deadline: '2099-02-30' })), 'impossible calendar date');
    assert.ok(issues(baseProject({ deadline: 'next friday' })));
    assert.ok(issues(baseProject({ deadline: '12/31/2099' })));
    assert.ok(issues(baseProject({ deadline: '2020-01-01' })), 'past');
    assert.ok(issues(baseProject({ deadline: '2090-01-01' })), 'too far in the future');
    assert.ok(
      issues(baseProject({ deadline: '2030-06-01', milestones: [baseMilestone('100', { deadline: '2030-06-02' })] })),
      'milestone after project deadline'
    );
    assert.equal(
      issues(baseProject({ deadline: '2030-06-01', milestones: [baseMilestone('100', { deadline: '2030-06-01' })] })),
      null
    );
  });
});
