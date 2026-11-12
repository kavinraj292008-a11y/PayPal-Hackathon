/**
 * One-off, idempotent data fix for databases seeded before Phase 0.
 * Old seed rows claimed provider PAYPAL with DEMO-PP-* ids. They were never
 * PayPal transactions. This relabels them as LOCAL_DEV simulations while
 * preserving the records and project history (nothing is deleted).
 *
 * Run:  npx tsx src/scripts/relabelSimulatedPayments.ts
 */
import { prisma } from '../db';

async function main() {
  const legacy = await prisma.paymentRecord.findMany({
    where: { orderId: { startsWith: 'DEMO-PP-' } },
  });
  const rename = (v: string | null) => (v ? v.replace(/^DEMO-PP-/, 'LOCAL-DEV-') : v);

  for (const r of legacy) {
    await prisma.paymentRecord.update({
      where: { id: r.id },
      data: {
        provider: 'LOCAL_DEV',
        orderId: rename(r.orderId)!,
        authorizationId: rename(r.authorizationId),
        captureId: rename(r.captureId),
        expiresAt: null,
        rawProviderMetadata: JSON.stringify({
          simulated: true,
          provider: 'LOCAL_DEV',
          note: 'Relabelled legacy seed record. Not a PayPal transaction.',
        }),
      },
    });
  }
  console.log(`Relabelled ${legacy.length} simulated payment record(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
