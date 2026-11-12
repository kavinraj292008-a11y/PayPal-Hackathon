/**
 * Server-side audit scoring policy ("server-v1").
 *
 * The model contributes ONE thing: a per-criterion verdict (status + reasoning)
 * for every real acceptance criterion. Everything numeric and every
 * recommendation is computed here, deterministically, from validated verdicts.
 * Model-claimed overall scores / recommendations / per-criterion scores are
 * stored for audit only and never trusted.
 *
 * Criterion points (equal weight per criterion):
 *   SATISFIED = 100, PARTIALLY_SATISFIED = 50, NOT_SATISFIED = 0, INSUFFICIENT_EVIDENCE = 0
 *   (unverified work earns nothing: it can never count as success)
 *
 * overallScore = round-half-up( sum(points) / criterionCount )   -- integer arithmetic
 *
 * overallStatus:
 *   COMPLIANT      every criterion SATISFIED
 *   NON_COMPLIANT  overallScore < 50
 *   PARTIAL        otherwise
 *
 * evidenceCoveragePercent = round( 100 * (criteria with a verdict other than
 *   INSUFFICIENT_EVIDENCE) / criterionCount ).  This is NOT a confidence
 *   or probability that the verdicts are correct; it only says how much of the
 *   checklist the supplied evidence made checkable.
 *
 * Recommendation (first matching rule wins):
 *   1. no accessible evidence text                         -> MANUAL_REVIEW
 *   2. injection-like content detected in the submission   -> MANUAL_REVIEW
 *   3. every criterion SATISFIED                           -> APPROVE_RECOMMENDED
 *   4. any NOT_SATISFIED or PARTIALLY_SATISFIED criterion  -> REQUEST_REVISION
 *   5. otherwise (only SATISFIED + INSUFFICIENT_EVIDENCE)  -> MANUAL_REVIEW
 *
 * With no accessible evidence text, SATISFIED verdicts are downgraded to
 * INSUFFICIENT_EVIDENCE: a freelancer's own summary is a claim, not evidence.
 *
 * None of this approves anything. A recommendation is advice to the human client.
 */
import type { CriterionStatus, AIRecommendation } from '@proofpay/shared';

export const SCORING_POLICY_VERSION = 'server-v1';

export const CRITERION_POINTS: Record<CriterionStatus, number> = {
  SATISFIED: 100,
  PARTIALLY_SATISFIED: 50,
  NOT_SATISFIED: 0,
  INSUFFICIENT_EVIDENCE: 0,
};

export interface CriterionVerdict {
  criterionId: string;
  status: CriterionStatus;
  reasoning: string;
  evidenceReference: string;
}

export interface CoverageCheck {
  ok: boolean;
  missing: string[];
  unknown: string[];
  duplicates: string[];
}

export function criterionIdFor(index: number): string {
  return `criterion-${index + 1}`;
}

/** Every real criterion must appear exactly once; nothing invented. */
export function checkCriteriaCoverage(expectedIds: readonly string[], returnedIds: readonly string[]): CoverageCheck {
  const expected = new Set(expectedIds);
  const seen = new Map<string, number>();
  for (const id of returnedIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  const missing = expectedIds.filter((id) => !seen.has(id));
  const unknown = [...seen.keys()].filter((id) => !expected.has(id));
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { ok: missing.length === 0 && unknown.length === 0 && duplicates.length === 0, missing, unknown, duplicates };
}

export interface ScoringInput {
  verdicts: CriterionVerdict[];
  hasEvidenceText: boolean;
  injectionIndicators: string[];
}

export interface ScoringResult {
  verdicts: Array<CriterionVerdict & { score: number }>;
  overallScore: number;
  overallStatus: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT';
  evidenceCoveragePercent: number;
  recommendation: AIRecommendation;
  recommendationReasons: string[];
  counts: Record<CriterionStatus, number>;
  downgradedCriteria: string[];
  policyVersion: string;
}

export function scoreAudit(input: ScoringInput): ScoringResult {
  const n = input.verdicts.length;
  if (n === 0) throw new Error('Cannot score an audit with no criteria.');

  const downgradedCriteria: string[] = [];
  const verdicts = input.verdicts.map((v) => {
    let status = v.status;
    if (!input.hasEvidenceText && status === 'SATISFIED') {
      status = 'INSUFFICIENT_EVIDENCE';
      downgradedCriteria.push(v.criterionId);
    }
    return { ...v, status, score: CRITERION_POINTS[status] };
  });

  const counts: Record<CriterionStatus, number> = {
    SATISFIED: 0,
    PARTIALLY_SATISFIED: 0,
    NOT_SATISFIED: 0,
    INSUFFICIENT_EVIDENCE: 0,
  };
  let points = 0;
  for (const v of verdicts) {
    counts[v.status] += 1;
    points += v.score;
  }

  const overallScore = Math.floor((2 * points + n) / (2 * n));
  const verifiable = n - counts.INSUFFICIENT_EVIDENCE;
  const evidenceCoveragePercent = Math.floor((200 * verifiable + n) / (2 * n));
  const overallStatus = counts.SATISFIED === n ? 'COMPLIANT' : overallScore < 50 ? 'NON_COMPLIANT' : 'PARTIAL';

  const reasons: string[] = [];
  let recommendation: AIRecommendation;
  if (!input.hasEvidenceText) {
    recommendation = 'MANUAL_REVIEW';
    reasons.push('No accessible evidence text was submitted, so no criterion could be verified.');
  } else if (input.injectionIndicators.length > 0) {
    recommendation = 'MANUAL_REVIEW';
    reasons.push(
      `The submission contains instruction-like text aimed at the auditor (${input.injectionIndicators.join('; ')}). It was treated as untrusted data; a human must review it.`
    );
  } else if (counts.SATISFIED === n) {
    recommendation = 'APPROVE_RECOMMENDED';
    reasons.push('All acceptance criteria were judged satisfied by the supplied evidence.');
  } else if (counts.NOT_SATISFIED > 0 || counts.PARTIALLY_SATISFIED > 0) {
    recommendation = 'REQUEST_REVISION';
    reasons.push(
      `${counts.NOT_SATISFIED} criterion(s) not satisfied and ${counts.PARTIALLY_SATISFIED} only partially satisfied.`
    );
  } else {
    recommendation = 'MANUAL_REVIEW';
    reasons.push(`${counts.INSUFFICIENT_EVIDENCE} criterion(s) could not be verified from the supplied evidence.`);
  }
  if (counts.INSUFFICIENT_EVIDENCE > 0 && recommendation !== 'MANUAL_REVIEW') {
    reasons.push(`${counts.INSUFFICIENT_EVIDENCE} criterion(s) also lacked sufficient evidence (counted as 0 points).`);
  }
  if (downgradedCriteria.length > 0) {
    reasons.push(
      `${downgradedCriteria.length} SATISFIED verdict(s) were downgraded to INSUFFICIENT_EVIDENCE because a self-reported summary is not evidence.`
    );
  }

  return {
    verdicts,
    overallScore,
    overallStatus,
    evidenceCoveragePercent,
    recommendation,
    recommendationReasons: reasons,
    counts,
    downgradedCriteria,
    policyVersion: SCORING_POLICY_VERSION,
  };
}

/** Normalises legacy lower-case statuses/recommendations stored before Phase 1. */
export function normalizeCriterionStatus(value: string): CriterionStatus {
  const v = String(value).toUpperCase();
  return (['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED', 'INSUFFICIENT_EVIDENCE'] as const).includes(v as CriterionStatus)
    ? (v as CriterionStatus)
    : 'INSUFFICIENT_EVIDENCE';
}

export function normalizeRecommendation(value: string): AIRecommendation {
  const v = String(value).toUpperCase();
  return (['APPROVE_RECOMMENDED', 'REQUEST_REVISION', 'MANUAL_REVIEW'] as const).includes(v as AIRecommendation)
    ? (v as AIRecommendation)
    : 'MANUAL_REVIEW';
}
