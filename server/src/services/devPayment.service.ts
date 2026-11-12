import type { Prisma } from '@prisma/client';
import { DEV_PROVIDER, isSimulatedPayment } from '../domain/payments';
import { HttpError } from '../errors';

type Tx = Prisma.TransactionClient;

interface MilestoneLike {
  id: string;
  amountMinor: number;
  currency: string;
}

/**
 * Development payment simulation. Ids are deliberately NOT PayPal-shaped.
 * These records move no money and call no external service.
 */
const meta = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ simulated: true, provider: DEV_PROVIDER, ...extra });

export async function recordSimulatedAuthorization(tx: Tx, m: MilestoneLike) {
  const existing = await tx.paymentRecord.findFirst({
    where: { milestoneId: m.id },
    orderBy: { createdAt: 'desc' },
  });
  if (existing && (existing.status === 'AUTHORIZED' || existing.status === 'CAPTURED')) {
    return existing; // idempotent
  }
  const attempt = (await tx.paymentRecord.count({ where: { milestoneId: m.id } })) + 1;
  return tx.paymentRecord.create({
    data: {
      milestoneId: m.id,
      provider: DEV_PROVIDER,
      orderId: `LOCAL-DEV-ORDER-${m.id}-${attempt}`,
      authorizationId: `LOCAL-DEV-AUTH-${m.id}-${attempt}`,
      amountMinor: m.amountMinor,
      currency: m.currency,
      status: 'AUTHORIZED',
      rawProviderMetadata: meta({ note: 'Simulated authorization. No funds were reserved.' }),
    },
  });
}

/** Called only after explicit client approval. Never callable from the AI route. */
export async function recordSimulatedRelease(tx: Tx, m: MilestoneLike) {
  const existing = await tx.paymentRecord.findFirst({
    where: { milestoneId: m.id },
    orderBy: { createdAt: 'desc' },
  });

  if (existing && !isSimulatedPayment(existing)) {
    // Real provider records can only be captured by a real provider integration.
    throw new HttpError(
      409,
      'REAL_PAYMENT_REQUIRES_PROVIDER',
      'A non-simulated payment exists for this milestone; it cannot be released by the development provider.'
    );
  }
  if (existing && existing.status === 'CAPTURED') return existing; // idempotent

  if (existing && existing.status === 'AUTHORIZED') {
    return tx.paymentRecord.update({
      where: { id: existing.id },
      data: {
        status: 'CAPTURED',
        captureId: `LOCAL-DEV-CAPTURE-${m.id}-${existing.orderId.split('-').pop()}`,
        rawProviderMetadata: meta({ note: 'Simulated release. No funds moved.' }),
      },
    });
  }

  const attempt = (await tx.paymentRecord.count({ where: { milestoneId: m.id } })) + 1;
  return tx.paymentRecord.create({
    data: {
      milestoneId: m.id,
      provider: DEV_PROVIDER,
      orderId: `LOCAL-DEV-ORDER-${m.id}-${attempt}`,
      authorizationId: `LOCAL-DEV-AUTH-${m.id}-${attempt}`,
      captureId: `LOCAL-DEV-CAPTURE-${m.id}-${attempt}`,
      amountMinor: m.amountMinor,
      currency: m.currency,
      status: 'CAPTURED',
      rawProviderMetadata: meta({ note: 'Simulated release. No funds moved.' }),
    },
  });
}
