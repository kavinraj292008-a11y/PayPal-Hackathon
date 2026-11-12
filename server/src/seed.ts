import { prisma } from './db';

export async function seedDemoData() {
  console.log('🌱 Starting ProofPay demo seed...');

  // Clean existing tables in topological order
  await prisma.auditLog.deleteMany();
  await prisma.paymentRecord.deleteMany();
  await prisma.aIReview.deleteMany();
  await prisma.deliverableSubmission.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // 1. Seed Demo Client
  const clientUser = await prisma.user.create({
    data: {
      id: 'demo-client-elena',
      email: 'elena.vance@demo.proofpay.io',
      name: 'Elena Vance',
      role: 'CLIENT',
      title: 'VP of Product at Horizon FinTech',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      paypalEmail: 'elena-buyer@demo.proofpay.io',
      isDemoAccount: true,
    },
  });

  // 2. Seed Demo Freelancer
  const freelancerUser = await prisma.user.create({
    data: {
      id: 'demo-freelancer-marcus',
      email: 'marcus.chen@demo.proofpay.io',
      name: 'Marcus Chen',
      role: 'FREELANCER',
      title: 'Senior Distributed Systems Architect',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      paypalEmail: 'marcus-contractor@demo.proofpay.io',
      isDemoAccount: true,
    },
  });

  // 3. Seed Realistic Project
  const project = await prisma.project.create({
    data: {
      id: 'proj-fintech-recon',
      title: 'Real-Time Multi-Currency Settlement Engine',
      description:
        'Development of a low-latency financial reconciliation engine capable of cross-referencing multi-currency ledger balances, detecting anomalies, and triggering idempotent settlement batches.',
      totalBudgetMinor: 600000,
      currency: 'USD',
      status: 'ACTIVE',
      clientId: clientUser.id,
      freelancerId: freelancerUser.id,
    },
  });

  // 4. Milestone 1: Completed & Payment Captured
  const m1 = await prisma.milestone.create({
    data: {
      id: 'ms-arch-spec',
      projectId: project.id,
      orderIndex: 1,
      title: 'Data Architecture Specification & Ingestion Pipeline',
      description:
        'Deliver complete TypeScript domain models, SQLite/Prisma schema, and mock data ingestion pipeline capable of ingesting 10k records/sec.',
      amountMinor: 150000,
      currency: 'USD',
      status: 'COMPLETED',
      acceptanceCriteria: JSON.stringify([
        'Prisma models with full relational integrity and index definitions',
        'TypeScript ingestion pipeline with batch validation using Zod',
        'Unit test coverage surpassing 90% for normalization functions',
        'Architecture decision record (ADR) document committed to repo',
      ]),
    },
  });

  await prisma.paymentRecord.create({
    data: {
      id: 'pay-m1-record',
      milestoneId: m1.id,
      provider: 'LOCAL_DEV',
      orderId: 'LOCAL-DEV-ORD-88219A',
      authorizationId: 'LOCAL-DEV-AUTH-88219A',
      captureId: 'LOCAL-DEV-CAP-88219A',
      amountMinor: 150000,
      currency: 'USD',
      status: 'CAPTURED',
            rawProviderMetadata: JSON.stringify({
        simulated: true,
        provider: 'LOCAL_DEV',
        note: 'SIMULATED seed record. Not a PayPal transaction; no funds were authorized or captured.',
      }),
    },
  });

  // 5. Milestone 2: Deliverable Submitted & Awaiting AI Review / Client Sign-off
  const m2 = await prisma.milestone.create({
    data: {
      id: 'ms-recon-engine',
      projectId: project.id,
      orderIndex: 2,
      title: 'Reconciliation Matching Core & Anomaly Detector',
      description:
        'Implement double-entry transaction matching algorithm with anomaly categorization, discrepancy logging, and deterministic idempotency keys.',
      amountMinor: 250000,
      currency: 'USD',
      status: 'SUBMITTED',
      acceptanceCriteria: JSON.stringify([
        'Deterministic transaction matching with sub-second execution on 5,000 paired lines',
        'Discrepancy categorizer flagging unlinked credits, debits, and timing differences',
        'All database mutations wrapped in atomic transactions',
        'Full test suite demonstrating idempotency under retry conditions',
      ]),
    },
  });

  await prisma.paymentRecord.create({
    data: {
      id: 'pay-m2-record',
      milestoneId: m2.id,
      provider: 'LOCAL_DEV',
      orderId: 'LOCAL-DEV-ORD-94102B',
      authorizationId: 'LOCAL-DEV-AUTH-94102B',
      amountMinor: 250000,
      currency: 'USD',
      status: 'AUTHORIZED',
            rawProviderMetadata: JSON.stringify({
        simulated: true,
        provider: 'LOCAL_DEV',
        note: 'SIMULATED seed record. Not a PayPal transaction; no funds are held.',
      }),
    },
  });

  await prisma.deliverableSubmission.create({
    data: {
      id: 'sub-m2-recon',
      milestoneId: m2.id,
      authorId: freelancerUser.id,
      revision: 1,
      summary:
        'Completed the core reconciliation engine with deterministic key hashing, atomic transactions, and automated anomaly flagging. Added 14 unit and integration test suites.',
      deliverableUrl: 'https://github.com/proofpay-demo/reconciliation-engine/pull/4',
      notes:
        'All benchmark tests passed with 5k transactions processed in 412ms. Uploaded engine code summary in the evidence field for inspection.',
      uploadedEvidenceText: `
// Evidence Sample: Atomic reconciliation batch processor
export async function processBatchReconciliation(batchId: string, lines: LedgerLine[]) {
  return await prisma.$transaction(async (tx) => {
    const matched = [];
    const anomalies = [];
    for (const line of lines) {
      const match = await tx.ledgerEntry.findFirst({
        where: { hashKey: line.hashKey, status: 'PENDING' }
      });
      if (match && match.amount === line.amount) {
        matched.push(match.id);
      } else {
        anomalies.push({ lineId: line.id, reason: 'AMOUNT_MISMATCH_OR_MISSING' });
      }
    }
    return { matchedCount: matched.length, anomalies };
  });
}
`,
    },
  });

  // 6. Milestone 3: Awaiting Payment Authorization
  await prisma.milestone.create({
    data: {
      id: 'ms-settlement-webhook',
      projectId: project.id,
      orderIndex: 3,
      title: 'Settlement Webhook Coordinator & Export Reporting',
      description:
        'Implement resilient webhook dispatcher with exponential backoff retry and automated end-of-day CSV/JSON reconciliation export.',
      amountMinor: 200000,
      currency: 'USD',
      status: 'AWAITING_PAYMENT_AUTH',
      acceptanceCriteria: JSON.stringify([
        'HMAC SHA-256 signature verification on inbound webhooks',
        'Exponential backoff retry policy (1s, 5s, 30s, 5m) with dead-letter queue',
        'Streaming CSV export generator for audit reporting',
      ]),
    },
  });

  console.log('✅ ProofPay demo seed completed successfully.');
}
