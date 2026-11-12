import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject demo role header from localStorage
// DEMO MODE ONLY: the role is a UI selection, not authentication. The server
// rejects missing/invalid roles; it never defaults them.
apiClient.interceptors.request.use((config) => {
  const stored = localStorage.getItem('proofpay_demo_role');
  const activeRole = stored === 'CLIENT' || stored === 'FREELANCER' ? stored : 'CLIENT';
  config.headers['x-demo-role'] = activeRole;
  return config;
});

/** Extracts a human-readable message from an axios/API error. */
export function getApiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  const e = err as any;
  return e?.response?.data?.error || e?.message || fallback;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  database: string;
  paymentProviderMode: string;
  paypal?: { credentialsConfigured: boolean; integration: string; active: boolean };
  demoMode?: boolean;
  authentication?: string;
  aiConfigured: boolean;
  uptimeSeconds: number;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health');
  return data;
}

export async function fetchDemoUsers() {
  const { data } = await apiClient.get('/demo/users');
  return data.users;
}

export async function resetDemoData() {
  const { data } = await apiClient.post('/demo/reset');
  return data;
}

export interface MilestoneItem {
  id: string;
  projectId: string;
  orderIndex: number;
  title: string;
  description: string;
  amountMinor: number;
  /** Exact decimal string, e.g. "1500.00". Authoritative value is amountMinor. */
  amount: string;
  currency: string;
  deadline?: string | null;
  status:
    | 'DRAFT'
    | 'AWAITING_PAYMENT_AUTH'
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'AI_REVIEWED'
    | 'PAYMENT_APPROVED'
    | 'COMPLETED'
    | 'REVISION_REQUESTED';
  acceptanceCriteria: string[];
  currentPayment?: {
    id: string;
    provider?: string;
    /** true for every LOCAL_DEV / legacy-seed record: no real PayPal transaction exists. */
    simulated?: boolean;
    simulatedLabel?: string | null;
    orderId: string;
    authorizationId?: string;
    captureId?: string;
    amountMinor: number;
    amount: string;
    currency: string;
    status: string;
    expiresAt?: string;
    rawProviderMetadata?: any;
  } | null;
  submissions?: Array<{
    id: string;
    authorId: string;
    author?: { name: string; email: string };
    summary: string;
    deliverableUrl: string;
    notes?: string;
    uploadedEvidenceText?: string;
    aiReviews?: any[];
    createdAt: string;
  }>;
}

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  totalBudgetMinor: number;
  /** Exact decimal string, e.g. "6000.00". */
  totalBudget: string;
  currency: string;
  deadline?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  clientId: string;
  client?: { id: string; name: string; email: string; title: string; avatarUrl?: string };
  freelancerId?: string;
  freelancer?: { id: string; name: string; email: string; title: string; avatarUrl?: string };
  milestones: MilestoneItem[];
  stats: {
    totalMilestones: number;
    completedMilestones: number;
    progressPercent: number;
    /** Integer minor units, derived only from payment records. */
    authorizedAmountMinor: number;
    capturedAmountMinor: number;
    approvedAmountMinor: number;
    paymentsAreSimulated?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export async function fetchProjects(): Promise<ProjectItem[]> {
  const { data } = await apiClient.get<{ projects: ProjectItem[] }>('/projects');
  return data.projects;
}

export async function fetchProject(id: string): Promise<ProjectItem> {
  const { data } = await apiClient.get<{ project: ProjectItem }>(`/projects/${id}`);
  return data.project;
}

export async function createProject(payload: {
  title: string;
  description: string;
  /** Decimal string, e.g. "6000.00" (validated and converted to minor units by the server). */
  totalBudget: string;
  currency?: string;
  freelancerId?: string;
  milestones?: Array<{
    title: string;
    description: string;
    amount: string;
    currency?: string;
    deadline?: string;
    acceptanceCriteria?: string[];
  }>;
}): Promise<ProjectItem> {
  const { data } = await apiClient.post<{ project: ProjectItem }>('/projects', payload);
  return data.project;
}

export async function updateMilestone(
  id: string,
  payload: {
    title?: string;
    description?: string;
    amount?: string;
    acceptanceCriteria?: string[];
    deadline?: string | null;
  }
): Promise<MilestoneItem> {
  const { data } = await apiClient.patch<{ milestone: MilestoneItem }>(`/milestones/${id}`, payload);
  return data.milestone;
}

/**
 * Human-driven status transition (validated by the server state machine).
 * Payment effects in development are SIMULATED only.
 */
export async function transitionMilestone(
  id: string,
  to: MilestoneItem['status']
): Promise<MilestoneItem> {
  const { data } = await apiClient.post<{ milestone: MilestoneItem }>(
    `/milestones/${id}/transition`,
    { to }
  );
  return data.milestone;
}

export interface GeneratedMilestoneAI {
  title: string;
  description: string;
  amountMinor: number;
  amount: string;
  currency: string;
  estimatedDays: number;
  acceptanceCriteria: string[];
}

export interface AIGenerationResponse {
  success: boolean;
  projectSummary: string;
  milestones: GeneratedMilestoneAI[];
  model: string;
  generatedAt: string;
}

export async function generateMilestonesWithAI(params: {
  projectTitle: string;
  projectDescription: string;
  totalBudget: string;
  currency?: string;
  estimatedWeeks?: number;
  clientRequirements?: string;
}): Promise<AIGenerationResponse> {
  const { data } = await apiClient.post<AIGenerationResponse>('/ai/generate-milestones', params);
  return data;
}

export async function submitDeliverable(
  milestoneId: string,
  payload: {
    summary: string;
    deliverableUrl: string;
    notes?: string;
    uploadedEvidenceText?: string;
  }
) {
  const { data } = await apiClient.post(`/milestones/${milestoneId}/submissions`, payload);
  return data;
}

export interface AIAuditResultResponse {
  success: boolean;
  reviewId: string;
  overallStatus: 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT';
  /** Computed on the SERVER from validated per-criterion verdicts. */
  overallScore: number;
  /** % of criteria the evidence allowed a verdict on. NOT a probability of correctness. */
  evidenceCoveragePercent?: number;
  scoringPolicyVersion?: string;
  summary: string;
  /** Computed on the SERVER. Advisory only. */
  recommendation: 'APPROVE_RECOMMENDED' | 'REQUEST_REVISION' | 'MANUAL_REVIEW';
  recommendationReasons?: string[];
  criteriaResults: Array<{
    criterionId: string;
    status: 'SATISFIED' | 'PARTIALLY_SATISFIED' | 'NOT_SATISFIED' | 'INSUFFICIENT_EVIDENCE';
    score: number;
    reasoning: string;
    evidenceReference: string;
  }>;
  missingRequirements: string[];
  risks: string[];
  evidenceLimitations: string[];
  model: string;
  auditedAt: string;
  advisoryNotice: string;
}

export async function auditSubmissionWithAI(submissionId: string): Promise<AIAuditResultResponse> {
  const { data } = await apiClient.post<AIAuditResultResponse>(`/ai/audit-submission/${submissionId}`);
  return data;
}

export async function fetchAIConfig() {
  const { data } = await apiClient.get('/ai/config');
  return data;
}

export interface PayPalConfig {
  enabled: boolean;
  clientId: string;
  currency: string;
  environment: 'sandbox';
}

export async function fetchPayPalConfig(): Promise<PayPalConfig> {
  const { data } = await apiClient.get<PayPalConfig>('/payments/config');
  return data;
}

export async function createPayPalOrder(milestoneId: string) {
  const { data } = await apiClient.post<{
    success: boolean;
    orderId: string;
    approvalUrl: string;
    environment: string;
  }>(`/payments/milestones/${milestoneId}/order`);

  return data;
}

export async function authorizePayPalOrder(
  milestoneId: string,
  orderId: string
) {
  const { data } = await apiClient.post(
    `/payments/milestones/${milestoneId}/authorize`,
    { orderId }
  );
  return data;
}

export async function capturePayPalMilestone(milestoneId: string) {
  const { data } = await apiClient.post(
    `/payments/milestones/${milestoneId}/capture`
  );
  return data;
}