import { z } from 'zod';
import {
  CURRENCY_CODES,
  CurrencyCode,
  MoneyError,
  minorToDecimalString,
  parseDecimalToMinor,
  sumMinor,
} from './money';
import { LIMITS, deadlineProblem, parseStrictDeadline, validateHttpUrl } from './validation';

export const DemoRoleSchema = z.enum(['CLIENT', 'FREELANCER']);

export const ProjectStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']);

export const MilestoneStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_PAYMENT_AUTH',
  'IN_PROGRESS',
  'SUBMITTED',
  'AI_REVIEWED',
  'PAYMENT_APPROVED',
  'COMPLETED',
  'REVISION_REQUESTED',
]);

export const PaymentStatusSchema = z.enum([
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'VOIDED',
  'EXPIRED',
  'DENIED',
  'FAILED',
]);

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------
export const CurrencySchema = z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]], {
  errorMap: () => ({ message: `Unsupported currency. Allowed: ${CURRENCY_CODES.join(', ')}` }),
});

/** Accepts a decimal string or a number at the API boundary; converted to minor units by the object schemas. */
export const MoneyInputSchema = z.union([z.string(), z.number()], {
  errorMap: () => ({ message: 'Amount must be a decimal string or number' }),
});

export const HttpUrlSchema = z.string().superRefine((value, ctx) => {
  const r = validateHttpUrl(value);
  if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.reason });
});

const DeadlineInputSchema = z.string().superRefine((value, ctx) => {
  const d = parseStrictDeadline(value);
  if (!d) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Deadline must be a valid ISO date (YYYY-MM-DD) or date-time' });
    return;
  }
  const problem = deadlineProblem(d);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

export const CriterionTextSchema = z
  .string()
  .trim()
  .min(LIMITS.CRITERION_MIN, `Criterion must be at least ${LIMITS.CRITERION_MIN} characters`)
  .max(LIMITS.CRITERION_MAX, `Criterion must be at most ${LIMITS.CRITERION_MAX} characters`);

export const AcceptanceCriteriaSchema = z
  .array(CriterionTextSchema)
  .min(1, 'At least one acceptance criterion is required')
  .max(LIMITS.CRITERIA_MAX_PER_MILESTONE, `At most ${LIMITS.CRITERIA_MAX_PER_MILESTONE} criteria per milestone`);

// ---------------------------------------------------------------------------
// Project creation
// ---------------------------------------------------------------------------
export const CreateMilestoneInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Title required').max(LIMITS.TITLE_MAX),
    description: z.string().trim().min(5, 'Description required').max(LIMITS.DESCRIPTION_MAX),
    amount: MoneyInputSchema,
    currency: CurrencySchema.optional(),
    deadline: DeadlineInputSchema.optional(),
    acceptanceCriteria: AcceptanceCriteriaSchema,
  })
  .strict();

export const CreateProjectInputSchema = z
  .object({
    title: z.string().trim().min(LIMITS.TITLE_MIN, `Title must be at least ${LIMITS.TITLE_MIN} characters`).max(LIMITS.TITLE_MAX),
    description: z.string().trim().min(LIMITS.DESCRIPTION_MIN, `Description must be at least ${LIMITS.DESCRIPTION_MIN} characters`).max(LIMITS.DESCRIPTION_MAX),
    totalBudget: MoneyInputSchema,
    currency: CurrencySchema.default('USD'),
    deadline: DeadlineInputSchema.optional(),
    freelancerId: z.string().min(1).max(100).optional(),
    milestones: z
      .array(CreateMilestoneInputSchema)
      .min(LIMITS.MILESTONES_MIN, 'At least one milestone is required')
      .max(LIMITS.MILESTONES_MAX, `At most ${LIMITS.MILESTONES_MAX} milestones`),
  })
  .strict();

export interface ValidatedProjectInput {
  title: string;
  description: string;
  currency: CurrencyCode;
  totalBudgetMinor: number;
  deadline: Date | null;
  freelancerId?: string;
  milestones: Array<{
    title: string;
    description: string;
    amountMinor: number;
    currency: CurrencyCode;
    deadline: Date | null;
    acceptanceCriteria: string[];
  }>;
}

/**
 * Full server-side project validation:
 *  - amounts parsed into integer minor units with the project's currency
 *  - milestone amounts must sum EXACTLY to the budget
 *  - milestone currency (if given) must equal the project currency
 *  - milestone deadlines must not be after the project deadline
 */
export const CreateProjectSchema = CreateProjectInputSchema.transform((v, ctx): ValidatedProjectInput => {
  const currency = v.currency;
  const parse = (value: string | number, path: (string | number)[]): number => {
    try {
      return parseDecimalToMinor(value, currency);
    } catch (e) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: e instanceof MoneyError ? e.message : 'Invalid amount' });
      return 0;
    }
  };

  const totalBudgetMinor = parse(v.totalBudget, ['totalBudget']);
  const projectDeadline = v.deadline ? parseStrictDeadline(v.deadline) : null;

  const milestones = v.milestones.map((m, i) => {
    if (m.currency && m.currency !== currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['milestones', i, 'currency'],
        message: `Milestone currency must match the project currency (${currency})`,
      });
    }
    const deadline = m.deadline ? parseStrictDeadline(m.deadline) : null;
    if (deadline && projectDeadline && deadline.getTime() > projectDeadline.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['milestones', i, 'deadline'],
        message: 'Milestone deadline must not be after the project deadline',
      });
    }
    return {
      title: m.title,
      description: m.description,
      amountMinor: parse(m.amount, ['milestones', i, 'amount']),
      currency,
      deadline,
      acceptanceCriteria: m.acceptanceCriteria,
    };
  });

  if (totalBudgetMinor > 0 && milestones.every((m) => m.amountMinor > 0)) {
    const sum = sumMinor(milestones.map((m) => m.amountMinor));
    if (sum !== totalBudgetMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['milestones'],
        message: `Milestone amounts (${minorToDecimalString(sum, currency)}) must add up exactly to the project budget (${minorToDecimalString(totalBudgetMinor, currency)})`,
      });
    }
  }

  return {
    title: v.title,
    description: v.description,
    currency,
    totalBudgetMinor,
    deadline: projectDeadline,
    freelancerId: v.freelancerId,
    milestones,
  };
});

export const GenerateMilestonesRequestSchema = z
  .object({
    projectTitle: z.string().trim().min(2).max(LIMITS.TITLE_MAX),
    projectDescription: z.string().trim().min(LIMITS.DESCRIPTION_MIN).max(LIMITS.DESCRIPTION_MAX),
    totalBudget: MoneyInputSchema,
    currency: CurrencySchema.default('USD'),
    estimatedWeeks: z.number().int().positive().max(260).optional(),
    clientRequirements: z.string().trim().max(LIMITS.CLIENT_REQUIREMENTS_MAX).optional(),
  })
  .strict();

export const CriterionAnalysisSchema = z.object({
  criterion: z.string(),
  status: z.enum(['MET', 'UNMET', 'UNCLEAR']),
  findings: z.string(),
  evidenceCited: z.string(),
});

export const AIReviewResponseSchema = z.object({
  overallStatus: z.enum(['COMPLIANT', 'PARTIAL', 'NON_COMPLIANT']),
  evidenceCoveragePercent: z.number().int().min(0).max(100),
  summary: z.string(),
  criteriaAnalysis: z.array(CriterionAnalysisSchema),
  strengths: z.array(z.string()),
  gapsIdentified: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  evidenceLimitations: z.array(z.string()),
  clientRecommendation: z.string(),
  freelancerActionItems: z.array(z.string()),
  advisoryNotice: z.string(),
});

export const CreateDeliverableSubmissionSchema = z
  .object({
    summary: z.string().trim().min(LIMITS.SUMMARY_MIN, `Deliverable summary must be at least ${LIMITS.SUMMARY_MIN} characters`).max(LIMITS.SUMMARY_MAX, `Summary must be at most ${LIMITS.SUMMARY_MAX} characters`),
    deliverableUrl: HttpUrlSchema,
    notes: z.string().max(LIMITS.NOTES_MAX, `Notes must be at most ${LIMITS.NOTES_MAX} characters`).optional(),
    uploadedEvidenceText: z.string().max(LIMITS.EVIDENCE_MAX, `Evidence text must be at most ${LIMITS.EVIDENCE_MAX} characters`).optional(),
  })
  .strict();

export const CreatePaymentOrderSchema = z.object({
  milestoneId: z.string().min(1, 'Milestone ID is required'),
});

export const AuthorizePaymentOrderSchema = z.object({
  milestoneId: z.string().min(1),
  orderId: z.string().min(1),
});

export const CapturePaymentSchema = z.object({
  milestoneId: z.string().min(1),
  authorizationId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// AI audit vocabulary (single source of truth)
// ---------------------------------------------------------------------------
export const CRITERION_STATUSES = ['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'INSUFFICIENT_EVIDENCE'] as const;
export const CriterionStatusSchema = z.enum(CRITERION_STATUSES);
export const AI_RECOMMENDATIONS = ['APPROVE_RECOMMENDED', 'REQUEST_REVISION', 'MANUAL_REVIEW'] as const;
export const AIRecommendationSchema = z.enum(AI_RECOMMENDATIONS);
export const OverallAuditStatusSchema = z.enum(['COMPLIANT', 'PARTIAL', 'NON_COMPLIANT']);
export const PaymentProviderSchema = z.enum(['LOCAL_DEV', 'PAYPAL']);
