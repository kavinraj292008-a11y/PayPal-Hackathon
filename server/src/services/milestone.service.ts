import type { Prisma } from '@prisma/client';
import { Actor, MilestoneStatus } from '../domain/milestoneStateMachine';
import { HttpError } from '../errors';
import { recordSimulatedAuthorization, recordSimulatedRelease } from './devPayment.service';

type Tx = Prisma.TransactionClient;

export interface TransitionInput {
  milestone: {
    id: string;
    projectId: string;
    orderIndex: number;
    amountMinor: number;
    currency: string;
    status: string;
  };
  to: MilestoneStatus;
  actor: Actor;
  actorUserId?: string;
  /** Extra details persisted into the audit log. */
  details?: Record<string, unknown>;
}

/**
 * Applies an ALREADY-VALIDATED transition atomically. The status change is a
 * compare-and-set on the previous status, so concurrent requests cannot both
 * succeed (the loser gets 409). Must run inside a transaction.
 *
 * Payment side effects exist only for CLIENT-actor transitions and are limited
 * to the LOCAL_DEV simulation.
 */
export async function applyMilestoneTransition(tx: Tx, input: TransitionInput): Promise<void> {
  const { milestone, to, actor } = input;

  const res = await tx.milestone.updateMany({
    where: { id: milestone.id, status: milestone.status },
    data: { status: to },
  });
  if (res.count !== 1) {
    throw new HttpError(
      409,
      'MILESTONE_STATE_CONFLICT',
      'Milestone status changed while processing this request. Reload and try again.'
    );
  }

  if (actor === 'CLIENT' && to === 'IN_PROGRESS') {
    await recordSimulatedAuthorization(tx, milestone);
  }

  if (actor === 'CLIENT' && to === 'COMPLETED') {
    await recordSimulatedRelease(tx, milestone);
    // Unlock the next milestone for funding authorization.
    const next = await tx.milestone.findFirst({
      where: { projectId: milestone.projectId, orderIndex: milestone.orderIndex + 1 },
    });
    if (next && next.status === 'DRAFT') {
      await tx.milestone.updateMany({
        where: { id: next.id, status: 'DRAFT' },
        data: { status: 'AWAITING_PAYMENT_AUTH' },
      });
    }
  }

  await tx.auditLog.create({
    data: {
      userId: input.actorUserId ?? null,
      action: `MILESTONE_${milestone.status}_TO_${to}`,
      entityType: 'MILESTONE',
      entityId: milestone.id,
      details: JSON.stringify({ actor, from: milestone.status, to, ...input.details }),
    },
  });
}
