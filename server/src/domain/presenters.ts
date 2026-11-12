/**
 * API presenters: turn database rows into the response shapes the UI consumes.
 * They strip legacy/internal columns, expose money as {amountMinor, amount},
 * and normalise AI review vocabulary (including pre-Phase-1 lower-case rows).
 */
import { moneyFields, presentPayment, computeProjectStats } from './payments';
import { normalizeCriterionStatus, normalizeRecommendation } from './aiScoring';
import { safeHttpHref } from '@proofpay/shared';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function presentAIReview(r: any) {
  const {
    legacyConfidenceScore: _lc,
    rawResponse: _raw,
    modelRecommendation,
    modelOverallScore,
    ...rest
  } = r;
  const criteriaResults = parseJson<any[]>(r.criteriaResults, []).map((c) => ({
    ...c,
    status: normalizeCriterionStatus(c.status),
  }));
  return {
    ...rest,
    recommendation: normalizeRecommendation(r.recommendation),
    clientRecommendation: normalizeRecommendation(r.clientRecommendation ?? r.recommendation),
    criteriaResults,
    criteriaAnalysis: parseJson(r.criteriaAnalysis, []),
    strengths: parseJson(r.strengths, []),
    gapsIdentified: parseJson(r.gapsIdentified, []),
    missingEvidence: parseJson(r.missingEvidence, []),
    risks: parseJson(r.risks, []),
    evidenceLimitations: parseJson(r.evidenceLimitations, []),
    freelancerActionItems: parseJson(r.freelancerActionItems, []),
    recommendationReasons: parseJson(r.recommendationReasons, []),
    // The model's own claims are audit-trail data and are intentionally not exposed as results.
    modelClaimedOverallScore: modelOverallScore ?? null,
    modelClaimedRecommendation: modelRecommendation ?? null,
  };
}

export function presentSubmission(s: any) {
  return {
    ...s,
    // Defence in depth: legacy rows may contain a non-http(s) URL. Never hand one to the UI.
    deliverableUrl: safeHttpHref(s.deliverableUrl) ?? '',
    deliverableUrlUnsafe: safeHttpHref(s.deliverableUrl) === null,
    aiReviews: (s.aiReviews ?? []).map(presentAIReview),
  };
}

export function presentMilestone(m: any) {
  const { legacyAmount: _legacy, ...rest } = m;
  const payments = (m.paymentRecords ?? []).map(presentPayment);
  return {
    ...rest,
    ...moneyFields(m.amountMinor, m.currency),
    acceptanceCriteria: parseJson<string[]>(m.acceptanceCriteria, []),
    ...(m.submissions ? { submissions: m.submissions.map(presentSubmission) } : {}),
    ...(m.paymentRecords ? { paymentRecords: payments } : {}),
    currentPayment: payments[0] ?? null,
  };
}

export function presentProject(p: any) {
  const { legacyTotalBudget: _legacy, ...rest } = p;
  const milestones = (p.milestones ?? []).map(presentMilestone);
  return {
    ...rest,
    totalBudgetMinor: p.totalBudgetMinor,
    totalBudget: moneyFields(p.totalBudgetMinor, p.currency).amount,
    milestones,
    stats: computeProjectStats(milestones, p.currency),
  };
}
