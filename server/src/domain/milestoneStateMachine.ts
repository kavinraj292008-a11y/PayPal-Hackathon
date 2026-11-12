/**
 * Centralised milestone lifecycle rules. Every status change on the server
 * must be validated here. Gemini/AI has NO authority over approval or payment
 * states: the only AI-driven transition is SUBMITTED -> AI_REVIEWED, which is
 * advisory and carries no payment effect.
 */
export const MILESTONE_STATUSES = [
  'DRAFT',
  'AWAITING_PAYMENT_AUTH',
  'IN_PROGRESS',
  'SUBMITTED',
  'AI_REVIEWED',
  'PAYMENT_APPROVED',
  'COMPLETED',
  'REVISION_REQUESTED',
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type Actor = 'CLIENT' | 'FREELANCER' | 'SYSTEM' | 'AI';

export interface TransitionRule {
  from: MilestoneStatus;
  to: MilestoneStatus;
  actors: Actor[];
  /**
   * true  = may be requested through POST /milestones/:id/transition
   * false = only reachable through a dedicated route (submission, AI audit,
   *         system promotion) that performs its own validation.
   */
  direct: boolean;
}

export const TRANSITION_RULES: readonly TransitionRule[] = [
  // System promotion of the next milestone once the previous one is signed off
  { from: 'DRAFT', to: 'AWAITING_PAYMENT_AUTH', actors: ['SYSTEM'], direct: false },
  // Client authorises (SIMULATED in development) funding
  { from: 'AWAITING_PAYMENT_AUTH', to: 'IN_PROGRESS', actors: ['CLIENT'], direct: true },
  // Freelancer submissions (only via POST /milestones/:id/submissions)
  { from: 'IN_PROGRESS', to: 'SUBMITTED', actors: ['FREELANCER'], direct: false },
  { from: 'REVISION_REQUESTED', to: 'SUBMITTED', actors: ['FREELANCER'], direct: false },
  // Advisory AI audit (only via the AI audit route)
  { from: 'SUBMITTED', to: 'AI_REVIEWED', actors: ['AI'], direct: false },
  // Explicit human client decisions
  { from: 'SUBMITTED', to: 'REVISION_REQUESTED', actors: ['CLIENT'], direct: true },
  { from: 'AI_REVIEWED', to: 'REVISION_REQUESTED', actors: ['CLIENT'], direct: true },
  { from: 'SUBMITTED', to: 'COMPLETED', actors: ['CLIENT'], direct: true },
  { from: 'AI_REVIEWED', to: 'COMPLETED', actors: ['CLIENT'], direct: true },
  // Legacy status (no longer entered by any route) can still be closed out
  { from: 'PAYMENT_APPROVED', to: 'COMPLETED', actors: ['CLIENT'], direct: true },
];

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return typeof value === 'string' && (MILESTONE_STATUSES as readonly string[]).includes(value);
}

export function findRule(from: string, to: string): TransitionRule | undefined {
  return TRANSITION_RULES.find((r) => r.from === from && r.to === to);
}

export type TransitionCheck =
  | { ok: true; rule: TransitionRule }
  | { ok: false; httpStatus: 403 | 409; code: string; message: string };

/**
 * Validate a transition.
 *  - no rule for (from,to)                      -> 409 INVALID_TRANSITION
 *  - rule exists but actor/route not permitted   -> 403 TRANSITION_NOT_PERMITTED
 */
export function checkTransition(
  from: string,
  to: string,
  actor: Actor,
  opts: { direct: boolean }
): TransitionCheck {
  const rule = findRule(from, to);
  if (!rule) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'INVALID_TRANSITION',
      message: `Milestone cannot move from ${from} to ${to}.`,
    };
  }
  if (!rule.actors.includes(actor) || (opts.direct && !rule.direct)) {
    return {
      ok: false,
      httpStatus: 403,
      code: 'TRANSITION_NOT_PERMITTED',
      message: `${actor} is not permitted to move a milestone from ${from} to ${to} this way.`,
    };
  }
  return { ok: true, rule };
}

/** Statuses from which a freelancer submission is accepted. */
export const SUBMITTABLE_STATUSES: readonly MilestoneStatus[] = TRANSITION_RULES.filter(
  (r) => r.to === 'SUBMITTED'
).map((r) => r.from);

/** Statuses in which an advisory AI audit may run (re-audit keeps AI_REVIEWED). */
export const AUDITABLE_STATUSES: readonly MilestoneStatus[] = ['SUBMITTED', 'AI_REVIEWED'];

/** Amount and acceptance criteria are frozen once a milestone leaves pre-funding states. */
const TERMS_EDITABLE: readonly MilestoneStatus[] = ['DRAFT', 'AWAITING_PAYMENT_AUTH'];
export function areCommercialTermsLocked(status: string): boolean {
  return !(TERMS_EDITABLE as readonly string[]).includes(status);
}

/** A completed milestone is fully read-only. */
export function isMilestoneFrozen(status: string): boolean {
  return status === 'COMPLETED';
}
