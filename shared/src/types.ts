/**
 * ProofPay Shared Type Definitions
 * AI-Assisted Milestone Payment Coordination Platform
 */

export type DemoRole = 'CLIENT' | 'FREELANCER';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  title: string;
  avatarUrl?: string;
  paypalEmail?: string;
  isDemoAccount: true;
}

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type MilestoneStatus =
  | 'DRAFT'
  | 'AWAITING_PAYMENT_AUTH'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'AI_REVIEWED'
  | 'PAYMENT_APPROVED'
  | 'COMPLETED'
  | 'REVISION_REQUESTED';

export type PaymentStatus =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'VOIDED'
  | 'EXPIRED'
  | 'DENIED'
  | 'FAILED';

export type CriterionStatus =
  | 'SATISFIED'
  | 'PARTIALLY_SATISFIED'
  | 'NOT_SATISFIED'
  | 'INSUFFICIENT_EVIDENCE';

export type AIRecommendation =
  | 'APPROVE_RECOMMENDED'
  | 'REQUEST_REVISION'
  | 'MANUAL_REVIEW';

export interface AICriterionResult {
  criterionId: string;
  status: CriterionStatus;
  score: number;
  reasoning: string;
  evidenceReference: string;
}

export interface AIAuditReportDTO {
  id?: string;
  overallScore: number;
  overallStatus?: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT';
  summary: string;
  criteriaResults: AICriterionResult[];
  missingRequirements: string[];
  risks: string[];
  evidenceLimitations: string[];
  recommendation: AIRecommendation;
  modelId?: string;
  auditedAt?: string;
  advisoryNotice?: string;
}

export interface CriterionAnalysis {
  criterion: string;
  status: 'MET' | 'UNMET' | 'UNCLEAR';
  findings: string;
  evidenceCited: string;
}

export interface AIReviewResult {
  id?: string;
  overallStatus: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT';
  overallScore?: number;
  /** Share (0-100) of criteria for which the evidence allowed a verdict. NOT a probability of correctness. */
  evidenceCoveragePercent?: number;
  scoringPolicyVersion?: string;
  recommendationReasons?: string[];
  summary: string;
  recommendation?: AIRecommendation;
  criteriaResults?: AICriterionResult[];
  criteriaAnalysis: CriterionAnalysis[];
  strengths: string[];
  gapsIdentified: string[];
  missingEvidence: string[];
  risks?: string[];
  evidenceLimitations: string[]; // Explicit statement of what could not be inspected
  clientRecommendation: string;
  freelancerActionItems: string[];
  advisoryNotice: string; // Strictly disclaims automatic payment authorization
  modelId?: string;
  createdAt?: string;
}

export interface PaymentRecordDTO {
  id: string;
  milestoneId: string;
  provider: 'PAYPAL' | 'LOCAL_DEV';
  orderId: string;
  authorizationId?: string;
  captureId?: string;
  /** Integer minor units (cents/paise). */
  amountMinor: number;
  /** Decimal string with the currency's exponent, e.g. "1500.00". */
  amount: string;
  simulated?: boolean;
  currency: string;
  status: PaymentStatus;
  expiresAt?: string; // ISO 8601 string for authorization validity window
  rawProviderMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableSubmissionDTO {
  id: string;
  milestoneId: string;
  authorId: string;
  summary: string;
  deliverableUrl: string; // Staging, GitHub PR, Figma, Loom, etc.
  notes?: string;
  uploadedEvidenceText?: string; // Direct accessible content/evidence for AI evaluation
  aiReviews?: AIReviewResult[];
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDTO {
  id: string;
  projectId: string;
  orderIndex: number;
  title: string;
  description: string;
  /** Integer minor units (cents/paise). */
  amountMinor: number;
  /** Decimal string with the currency's exponent, e.g. "1500.00". */
  amount: string;
  currency: string;
  deadline?: string;
  status: MilestoneStatus;
  acceptanceCriteria: string[];
  submissions?: DeliverableSubmissionDTO[];
  paymentRecords?: PaymentRecordDTO[];
  currentPayment?: PaymentRecordDTO;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDTO {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  currency: string;
  status: ProjectStatus;
  clientId: string;
  client?: DemoUser;
  freelancerId?: string;
  freelancer?: DemoUser;
  milestones?: MilestoneDTO[];
  createdAt: string;
  updatedAt: string;
}
