import { Router } from 'express';
import { prisma } from '../../db';
import { CreateDeliverableSubmissionSchema } from '@proofpay/shared';
import { requireDemoRole } from '../../middleware/roleContext';
import { assertProjectParty } from '../../domain/access';
import { HttpError } from '../../errors';
import { SUBMITTABLE_STATUSES, checkTransition } from '../../domain/milestoneStateMachine';
import { applyMilestoneTransition } from '../../services/milestone.service';

export const submissionRouter = Router();

// POST /api/v1/milestones/:id/submissions - FREELANCER only, assigned freelancer only.
// Accepted only while the milestone is IN_PROGRESS or REVISION_REQUESTED.
submissionRouter.post(
  '/milestones/:id/submissions',
  requireDemoRole('FREELANCER'),
  async (req, res, next) => {
    try {
      const { id: milestoneId } = req.params;
      const validated = CreateDeliverableSubmissionSchema.parse(req.body);
      const user = req.demoUser!;

      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        include: { project: true },
      });

      if (!milestone) {
        throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found');
      }
      assertProjectParty(milestone.project, user);

      if (!(SUBMITTABLE_STATUSES as readonly string[]).includes(milestone.status)) {
        throw new HttpError(
          409,
          'MILESTONE_NOT_ACCEPTING_SUBMISSIONS',
          `Deliverables cannot be submitted while the milestone is ${milestone.status}.`
        );
      }
      const check = checkTransition(milestone.status, 'SUBMITTED', 'FREELANCER', { direct: false });
      if (!check.ok) {
        throw new HttpError(check.httpStatus, check.code, check.message);
      }

      // The status change is a compare-and-set, so a double submit cannot create
      // two submissions for the same state.
      const result = await prisma.$transaction(async (tx) => {
        await applyMilestoneTransition(tx, {
          milestone,
          to: 'SUBMITTED',
          actor: 'FREELANCER',
          actorUserId: user.id,
        });

        // Per-milestone revision number; unique (milestoneId, revision) is the DB-level backstop.
        const last = await tx.deliverableSubmission.findFirst({
          where: { milestoneId },
          orderBy: { revision: 'desc' },
        });

        return tx.deliverableSubmission.create({
          data: {
            milestoneId,
            authorId: user.id,
            revision: (last?.revision ?? 0) + 1,
            summary: validated.summary,
            deliverableUrl: validated.deliverableUrl,
            notes: validated.notes,
            uploadedEvidenceText: validated.uploadedEvidenceText,
          },
          include: {
            author: true,
            aiReviews: true,
          },
        });
      });

      res.status(201).json({
        success: true,
        submission: result,
        message: 'Deliverable submitted successfully. Ready for AI acceptance criteria audit.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/submissions/:id - Retrieve submission with AI reviews
submissionRouter.get('/submissions/:id', requireDemoRole(), async (req, res, next) => {
  try {
    const { id } = req.params;
    const submission = await prisma.deliverableSubmission.findUnique({
      where: { id },
      include: {
        author: true,
        aiReviews: {
          orderBy: { createdAt: 'desc' },
        },
        milestone: { include: { project: true } },
      },
    });

    if (!submission) {
      throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found');
    }
    assertProjectParty(submission.milestone.project, req.demoUser!);

    res.json({ submission });
  } catch (err) {
    next(err);
  }
});
