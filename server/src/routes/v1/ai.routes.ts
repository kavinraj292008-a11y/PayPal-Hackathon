import { Router } from 'express';
import { prisma } from '../../db';
import {
  generateMilestones,
  auditDeliverable,
  GeminiServiceError,
} from '../../services/gemini.service';
import {
  GenerateMilestonesRequestSchema,
  LIMITS,
  MoneyError,
  parseDecimalToMinor,
} from '@proofpay/shared';
import { requireDemoRole } from '../../middleware/roleContext';
import { assertProjectParty } from '../../domain/access';
import { HttpError } from '../../errors';
import { AUDITABLE_STATUSES } from '../../domain/milestoneStateMachine';
import { scoreAudit } from '../../domain/aiScoring';
import { detectInjectionAttempts } from '../../domain/injection';
import { ConcurrencyLimiter } from '../../services/concurrency';
import { getAiConfig } from '../../config/ai';
import { presentAIReview } from '../../domain/presenters';

export const aiRouter = Router();

// Every AI endpoint requires an explicit, valid demo role.
aiRouter.use(requireDemoRole());

/**
 * Injectable Gemini entry points (lets tests run without any external call).
 * The AI audit route has NO access to payment records and can only perform the
 * advisory SUBMITTED -> AI_REVIEWED transition.
 */
export const aiDeps = { generateMilestones, auditDeliverable };

/** One in-flight audit per milestone (single-process guard against duplicate Gemini runs). */
const auditsInFlight = new Set<string>();
/** Global cap on simultaneous Gemini calls; excess requests are rejected with 429, not queued. */
const aiLimiter = new ConcurrencyLimiter(() => getAiConfig().maxConcurrentCalls);

function geminiHttpStatus(code: string): number {
  switch (code) {
    case 'MISSING_API_KEY':
      return 503;
    case 'RATE_LIMITED':
      return 429;
    case 'TIMEOUT':
      return 504;
    case 'SAFETY_BLOCKED':
    case 'BUDGET_TOO_SMALL':
      return 422;
    default:
      return 502; // AUTH_ERROR, MODEL_UNAVAILABLE, UPSTREAM_ERROR, INVALID_OUTPUT, ...
  }
}

function sendGeminiError(res: any, err: GeminiServiceError) {
  const status = geminiHttpStatus(String(err.code));
  if (status === 429) res.set('Retry-After', '30');
  return res.status(status).json({
    error: err.message,
    code: err.code,
    ...(err.attempts ? { attempts: err.attempts } : {}),
  });
}

// ---------- POST /api/v1/ai/generate-milestones ----------
aiRouter.post('/generate-milestones', requireDemoRole('CLIENT'), async (req, res, next) => {
  let release: (() => void) | null = null;
  try {
    const input = GenerateMilestonesRequestSchema.parse(req.body);

    let totalBudgetMinor: number;
    try {
      totalBudgetMinor = parseDecimalToMinor(input.totalBudget, input.currency);
    } catch (e) {
      throw new HttpError(400, 'INVALID_AMOUNT', e instanceof MoneyError ? e.message : 'Invalid budget');
    }

    release = aiLimiter.tryAcquire();
    if (!release) {
      res.set('Retry-After', '5');
      throw new HttpError(429, 'AI_BUSY', 'Too many AI requests are running. Please retry shortly.');
    }

    const result = await aiDeps.generateMilestones({
      projectTitle: input.projectTitle,
      projectDescription: input.projectDescription,
      totalBudgetMinor,
      currency: input.currency,
      estimatedWeeks: input.estimatedWeeks,
      clientRequirements: input.clientRequirements,
    });

    res.json({
      success: true,
      projectSummary: result.projectSummary,
      milestones: result.milestones,
      model: result.model,
      generatedAt: result.generatedAt,
    });
  } catch (err: any) {
    if (err instanceof GeminiServiceError) return sendGeminiError(res, err);
    next(err);
  } finally {
    release?.();
  }
});

// ---------- POST /api/v1/ai/audit-submission/:submissionId ----------
const SERVER_EVIDENCE_LIMITATIONS = [
  'External URLs, repositories and files were NOT accessed. Only the text submitted in this application was evaluated.',
  'Evidence is freelancer-supplied; its authenticity was not independently verified.',
];

aiRouter.post('/audit-submission/:submissionId', async (req, res, next) => {
  let lockedMilestoneId: string | null = null;
  let release: (() => void) | null = null;
  try {
    const { submissionId } = req.params;
    const user = req.demoUser!;

    const submission = await prisma.deliverableSubmission.findUnique({
      where: { id: submissionId },
      include: { milestone: { include: { project: true } }, author: true },
    });
    if (!submission) {
      throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found');
    }
    assertProjectParty(submission.milestone.project, user);

    // An audit may never run against (or alter) a milestone outside SUBMITTED / AI_REVIEWED.
    if (!(AUDITABLE_STATUSES as readonly string[]).includes(submission.milestone.status)) {
      throw new HttpError(
        409,
        'MILESTONE_NOT_AUDITABLE',
        `Cannot audit: milestone is ${submission.milestone.status}. Audits are only possible for submitted work awaiting review.`
      );
    }

    // Only the most recent submission can be audited.
    const latest = await prisma.deliverableSubmission.findFirst({
      where: { milestoneId: submission.milestoneId },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && latest.id !== submission.id) {
      throw new HttpError(409, 'STALE_SUBMISSION', 'Only the latest submission for a milestone can be audited.');
    }

    let acceptanceCriteria: string[] = [];
    try {
      acceptanceCriteria = JSON.parse(submission.milestone.acceptanceCriteria);
    } catch {
      acceptanceCriteria = [];
    }
    if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
      throw new HttpError(400, 'NO_ACCEPTANCE_CRITERIA', 'Cannot audit: This milestone has no acceptance criteria defined.');
    }

    // Defensive size limits (legacy rows pre-date input validation).
    if (
      (submission.uploadedEvidenceText?.length ?? 0) > LIMITS.EVIDENCE_MAX ||
      submission.summary.length > LIMITS.SUMMARY_MAX ||
      (submission.notes?.length ?? 0) > LIMITS.NOTES_MAX
    ) {
      throw new HttpError(413, 'EVIDENCE_TOO_LARGE', 'The submission exceeds the size limits for AI auditing.');
    }

    // Prevent concurrent duplicate audits for the same milestone, and cap global AI concurrency.
    if (auditsInFlight.has(submission.milestoneId)) {
      throw new HttpError(409, 'AUDIT_IN_PROGRESS', 'An AI audit is already running for this milestone.');
    }
    release = aiLimiter.tryAcquire();
    if (!release) {
      res.set('Retry-After', '5');
      throw new HttpError(429, 'AI_BUSY', 'Too many AI audits are running. Please retry shortly.');
    }
    auditsInFlight.add(submission.milestoneId);
    lockedMilestoneId = submission.milestoneId;

    const result = await aiDeps.auditDeliverable({
      milestoneTitle: submission.milestone.title,
      milestoneDescription: submission.milestone.description,
      acceptanceCriteria,
      submissionSummary: submission.summary,
      deliverableUrl: submission.deliverableUrl,
      submissionNotes: submission.notes || undefined,
      uploadedEvidenceText: submission.uploadedEvidenceText || undefined,
    });

    // ---- Server-side scoring: the model's own score/recommendation are never trusted ----
    const injectionIndicators = detectInjectionAttempts([
      submission.summary,
      submission.notes,
      submission.uploadedEvidenceText,
    ]);
    if (result.injectionSuspected) injectionIndicators.push('the AI auditor reported suspected manipulation attempts');

    const scoring = scoreAudit({
      verdicts: result.verdicts,
      hasEvidenceText: Boolean(submission.uploadedEvidenceText && submission.uploadedEvidenceText.trim().length > 0),
      injectionIndicators,
    });

    const strengths = scoring.verdicts.filter((c) => c.status === 'SATISFIED').map((c) => c.reasoning);
    const gapsIdentified = scoring.verdicts
      .filter((c) => c.status === 'NOT_SATISFIED' || c.status === 'PARTIALLY_SATISFIED')
      .map((c) => c.reasoning);
    const freelancerActionItems = scoring.verdicts
      .filter((c) => c.status !== 'SATISFIED')
      .map((c) => `[${c.criterionId}] ${c.reasoning}`);
    const risks = [...result.risks, ...injectionIndicators.map((i) => `Possible prompt injection: ${i}.`)];
    const evidenceLimitations = [...result.evidenceLimitations, ...SERVER_EVIDENCE_LIMITATIONS];

    // Persist the review (append-only history) and the advisory status change atomically.
    // The milestone update is a compare-and-set: if the milestone left SUBMITTED/AI_REVIEWED
    // while Gemini was running (e.g. client approved), nothing is written and we return 409.
    const savedReview = await prisma.$transaction(async (tx) => {
      const moved = await tx.milestone.updateMany({
        where: { id: submission.milestoneId, status: { in: [...AUDITABLE_STATUSES] } },
        data: { status: 'AI_REVIEWED' },
      });
      if (moved.count !== 1) {
        throw new HttpError(
          409,
          'MILESTONE_STATE_CONFLICT',
          'Milestone status changed while the audit was running; the audit result was discarded.'
        );
      }

      const previous = await tx.aIReview.findFirst({
        where: { submissionId },
        orderBy: { sequence: 'desc' },
      });

      const review = await tx.aIReview.create({
        data: {
          submissionId,
          sequence: (previous?.sequence ?? 0) + 1,
          overallStatus: scoring.overallStatus,
          overallScore: scoring.overallScore,
          evidenceCoveragePercent: scoring.evidenceCoveragePercent,
          scoringPolicyVersion: scoring.policyVersion,
          recommendationReasons: JSON.stringify(scoring.recommendationReasons),
          modelOverallScore: result.modelClaims.overallScore === null ? null : Math.round(result.modelClaims.overallScore),
          modelRecommendation: result.modelClaims.recommendation,
          summary: result.summary,
          recommendation: scoring.recommendation,
          criteriaResults: JSON.stringify(scoring.verdicts),
          criteriaAnalysis: JSON.stringify(
            scoring.verdicts.map((c) => ({
              criterion: c.criterionId,
              status: c.status === 'SATISFIED' ? 'MET' : c.status === 'INSUFFICIENT_EVIDENCE' ? 'UNCLEAR' : 'UNMET',
              findings: c.reasoning,
              evidenceCited: c.evidenceReference,
            }))
          ),
          strengths: JSON.stringify(strengths),
          gapsIdentified: JSON.stringify(gapsIdentified),
          missingEvidence: JSON.stringify(result.missingRequirements),
          risks: JSON.stringify(risks),
          evidenceLimitations: JSON.stringify(evidenceLimitations),
          clientRecommendation: scoring.recommendation,
          freelancerActionItems: JSON.stringify(freelancerActionItems),
          advisoryNotice:
            'This AI evaluation is strictly advisory. It does not constitute payment approval. Only the human client may approve a milestone; real payment capture is not yet implemented.',
          modelId: result.model,
          rawResponse: result.rawResponse,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'AI_AUDIT_RECORDED',
          entityType: 'SUBMISSION',
          entityId: submissionId,
          details: JSON.stringify({
            reviewId: review.id,
            sequence: review.sequence,
            recommendation: scoring.recommendation,
            policy: scoring.policyVersion,
            advisoryOnly: true,
          }),
        },
      });
      return review;
    });

    const view = presentAIReview(savedReview);
    res.json({
      success: true,
      reviewId: savedReview.id,
      sequence: savedReview.sequence,
      overallStatus: scoring.overallStatus,
      overallScore: scoring.overallScore,
      evidenceCoveragePercent: scoring.evidenceCoveragePercent,
      scoringPolicyVersion: scoring.policyVersion,
      summary: result.summary,
      recommendation: scoring.recommendation,
      recommendationReasons: scoring.recommendationReasons,
      criteriaResults: view.criteriaResults,
      missingRequirements: result.missingRequirements,
      risks,
      evidenceLimitations,
      model: result.model,
      auditedAt: result.auditedAt,
      advisoryNotice:
        'This AI evaluation is strictly advisory. Milestone approval requires explicit human client sign-off.',
    });
  } catch (err: any) {
    if (err instanceof GeminiServiceError) return sendGeminiError(res, err);
    next(err);
  } finally {
    if (lockedMilestoneId) auditsInFlight.delete(lockedMilestoneId);
    release?.();
  }
});

// ---------- GET /api/v1/ai/config ----------
aiRouter.get('/config', (_req, res) => {
  const cfg = getAiConfig();
  const configured = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    aiEnabled: configured,
    model: cfg.model,
    fallbackModels: cfg.fallbackModels,
    timeoutMs: cfg.timeoutMs,
    maxAttempts: cfg.maxAttempts,
    scoring: 'server-side (server-v1)',
    features: { milestoneGeneration: configured, deliverableAudit: configured },
  });
});
