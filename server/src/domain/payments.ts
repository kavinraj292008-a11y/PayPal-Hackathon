/**
 * Payment honesty + money helpers.
 *
 * No PayPal integration exists yet. Every payment record is a LOCAL_DEV
 * simulation. A record is only treated as genuine when its provider is PAYPAL
 * and its order id does not look like a development id.
 *
 * All amounts are INTEGER MINOR UNITS. Sums are exact integer sums.
 */
import { CurrencyCode, isSupportedCurrency, minorToDecimalString, sumMinor } from '@proofpay/shared';

export const DEV_PROVIDER = 'LOCAL_DEV';
export const SIMULATED_LABEL = 'SIMULATED — no real funds were authorized or captured';

export function isSimulatedPayment(p: { provider: string; orderId: string }): boolean {
  if (p.provider !== 'PAYPAL') return true;
  // Legacy rows were once mislabelled PAYPAL with DEMO-/TEST-/LOCAL- ids.
  return /^(DEMO|TEST|LOCAL)[-_]/i.test(p.orderId);
}

/** API money representation: authoritative integer + exact decimal string. */
export function moneyFields(amountMinor: number, currency: string) {
  const code = (isSupportedCurrency(currency) ? currency : 'USD') as CurrencyCode;
  return { amountMinor, amount: minorToDecimalString(amountMinor, code) };
}

export function presentPayment<
  T extends { provider: string; orderId: string; amountMinor: number; currency: string }
>(p: T) {
  const { legacyAmount: _legacy, ...rest } = p as T & { legacyAmount?: number | null };
  const simulated = isSimulatedPayment(p);
  return {
    ...rest,
    ...moneyFields(p.amountMinor, p.currency),
    simulated,
    simulatedLabel: simulated ? SIMULATED_LABEL : null,
  };
}

interface StatsMilestone {
  status: string;
  amountMinor: number;
  currentPayment: { status: string; provider: string; orderId: string } | null;
}

export function computeProjectStats(milestones: StatsMilestone[], currency: string) {
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === 'COMPLETED').length;
  const progressPercent =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const sum = (fn: (m: StatsMilestone) => boolean) => sumMinor(milestones.filter(fn).map((m) => m.amountMinor));
  const authorizedAmountMinor = sum((m) => m.currentPayment?.status === 'AUTHORIZED');
  const capturedAmountMinor = sum((m) => m.currentPayment?.status === 'CAPTURED');
  const approvedAmountMinor = sum((m) => m.status === 'COMPLETED');

  return {
    totalMilestones,
    completedMilestones,
    progressPercent,
    // Derived ONLY from payment records, never from milestone status alone (integer minor units).
    authorizedAmountMinor,
    capturedAmountMinor,
    // Value of milestones the client has signed off (independent of any payment record).
    approvedAmountMinor,
    authorizedAmount: moneyFields(authorizedAmountMinor, currency).amount,
    capturedAmount: moneyFields(capturedAmountMinor, currency).amount,
    approvedAmount: moneyFields(approvedAmountMinor, currency).amount,
    // True unless at least one non-simulated payment exists.
    paymentsAreSimulated: milestones.every(
      (m) => !m.currentPayment || isSimulatedPayment(m.currentPayment)
    ),
  };
}
