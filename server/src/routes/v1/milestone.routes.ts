
import { Router } from 'express';
import { prisma } from '../../db';
import { z } from 'zod';
import {
  AcceptanceCriteriaSchema,
  LIMITS,
  MoneyError,
  MoneyInputSchema,
  deadlineProblem,
  isSupportedCurrency,
  parseDecimalToMinor,
  parseStrictDeadline,
  sumMinor,
  minorToDecimalString,
} from '@proofpay/shared';
import { requireDemoRole } from '../../middleware/roleContext';
import { assertProjectParty } from '../../domain/access';
import { HttpError } from '../../errors';
import {
  MILESTONE_STATUSES,
  areCommercialTermsLocked,
  checkTransition,
  isMilestoneFrozen,
} from '../../domain/milestoneStateMachine';
import { presentMilestone } from '../../domain/presenters';
import { applyMilestoneTransition } from '../../services/milestone.service';

export const milestoneRouter = Router();

// Every milestone endpoint requires an explicit, valid demo role.
milestoneRouter.use(requireDemoRole());

const UpdateMilestoneSchema = z
  .object({
    title: z.string().trim().min(2).max(LIMITS.TITLE_MAX).optional(),
    description: z.string().trim().min(5).max(LIMITS.DESCRIPTION_MAX).optional(),
    amount: MoneyInputSchema.optional(),
    acceptanceCriteria: AcceptanceCriteriaSchema.optional(),
    deadline: z.string().nullable().optional(),
  })
  .strict();

const TransitionSchema = z.object({ to: z.enum(MILESTONE_STATUSES) }).strict();

// GET /api/v1/milestones/:id
milestoneRouter.get('/:id', async (req, res, next) => {
  try {
    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.id },
      include: {
        project: { include: { client: true, freelancer: true } },
        submissions: {
          include: { author: true, aiReviews: { orderBy: { createdAt: 'desc' } } },
          orderBy: { createdAt: 'desc' },
        },
        paymentRecords: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!milestone) {
      throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found');
    }

    assertProjectParty(milestone.project, req.demoUser!);

    const { legacyTotalBudget: _legacy, ...project } = milestone.project as any;
    res.json({ milestone: { ...presentMilestone(milestone), project } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/milestones/:id
milestoneRouter.patch('/:id', requireDemoRole('CLIENT'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.body && typeof req.body === 'object' && 'status' in req.body) {
      throw new HttpError(
        400,
        'STATUS_CHANGE_NOT_ALLOWED',
        'Milestone status cannot be changed with PATCH. Use POST /milestones/:id/transition.'
      );
    }

    const validated = UpdateMilestoneSchema.parse(req.body);

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!milestone) {
      throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found');
    }

    assertProjectParty(milestone.project, req.demoUser!);

    if (isMilestoneFrozen(milestone.status)) {
      throw new HttpError(409, 'MILESTONE_FROZEN', 'A completed milestone cannot be edited.');
    }

    if (
      (validated.amount !== undefined || validated.acceptanceCriteria !== undefined) &&
      areCommercialTermsLocked(milestone.status)
    ) {
      throw new HttpError(
        409,
        'MILESTONE_TERMS_LOCKED',
        `Amount and acceptance criteria cannot be changed once a milestone is ${milestone.status}.`
      );
    }

    const updateData: any = {};

    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;

    if (validated.acceptanceCriteria !== undefined) {
      updateData.acceptanceCriteria = JSON.stringify(validated.acceptanceCriteria);
    }

    if (validated.amount !== undefined) {
      if (!isSupportedCurrency(milestone.currency)) {
        throw new HttpError(409, 'UNSUPPORTED_CURRENCY', 'Milestone currency is not supported.');
      }

      let amountMinor: number;

      try {
        amountMinor = parseDecimalToMinor(validated.amount, milestone.currency);
      } catch (e) {
        throw new HttpError(
          400,
          'INVALID_AMOUNT',
          e instanceof MoneyError ? e.message : 'Invalid amount'
        );
      }

      const siblings = await prisma.milestone.findMany({
        where: { projectId: milestone.projectId },
      });

      const newSum = sumMinor(
        siblings.map((s) => (s.id === milestone.id ? amountMinor : s.amountMinor))
      );

      if (newSum !== milestone.project.totalBudgetMinor) {
        throw new HttpError(
          409,
          'BUDGET_MISMATCH',
          `Milestone amounts would total ${minorToDecimalString(newSum, milestone.currency)} but the project budget is ${minorToDecimalString(milestone.project.totalBudgetMinor, milestone.currency)}. Amounts must always add up exactly.`
        );
      }

      updateData.amountMinor = amountMinor;
    }

    if (validated.deadline !== undefined) {
      if (validated.deadline === null || validated.deadline === '') {
        updateData.deadline = null;
      } else {
        const d = parseStrictDeadline(validated.deadline);
        const problem = d
          ? deadlineProblem(d)
          : 'Deadline must be a valid ISO date (YYYY-MM-DD) or date-time.';

        if (!d || problem) {
          throw new HttpError(400, 'INVALID_DEADLINE', problem!);
        }

        if (
          milestone.project.deadline &&
          d.getTime() > new Date(milestone.project.deadline).getTime()
        ) {
          throw new HttpError(
            400,
            'DEADLINE_AFTER_PROJECT',
            'Milestone deadline must not be after the project deadline.'
          );
        }

        updateData.deadline = d;
      }
    }

    const result = await prisma.milestone.updateMany({
      where: { id, status: milestone.status },
      data: updateData,
    });

    if (result.count !== 1) {
      throw new HttpError(
        409,
        'MILESTONE_STATE_CONFLICT',
        'Milestone changed while editing. Reload and try again.'
      );
    }

    const updated = await prisma.milestone.findUnique({
      where: { id },
      include: { paymentRecords: { orderBy: { createdAt: 'desc' } } },
    });

    res.json({ milestone: presentMilestone(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/milestones/:id/transition
milestoneRouter.post('/:id/transition', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { to } = TransitionSchema.parse(req.body);
    const user = req.demoUser!;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!milestone) {
      throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found');
    }

    assertProjectParty(milestone.project, user);

    // When PayPal is configured, payment-related transitions must
    // go through the dedicated PayPal endpoints, not simulated payments.
    const paypalConfigured =
      process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET;

    if (
      paypalConfigured &&
      ['IN_PROGRESS', 'COMPLETED'].includes(to)
    ) {
      throw new HttpError(
        409,
        'PAYPAL_ACTION_REQUIRED',
        'Use the dedicated PayPal authorization or capture endpoint for this action.'
      );
    }

    const check = checkTransition(milestone.status, to, user.role, { direct: true });

    if (!check.ok) {
      throw new HttpError(check.httpStatus, check.code, check.message);
    }

    await prisma.$transaction(async (tx) => {
      await applyMilestoneTransition(tx, {
        milestone,
        to,
        actor: user.role,
        actorUserId: user.id,
      });
    });

    const updated = await prisma.milestone.findUnique({
      where: { id },
      include: { paymentRecords: { orderBy: { createdAt: 'desc' } } },
    });

    res.json({
      success: true,
      milestone: presentMilestone(updated),
      paymentNotice:
        'Development mode: payment records are SIMULATED. No PayPal request was made and no real funds moved.',
    });
  } catch (err) {
    next(err);
  }
});
