import React, { useState } from 'react';
import {
  MilestoneItem,
  updateMilestone,
  transitionMilestone,
  getApiErrorMessage,
  submitDeliverable,
  auditSubmissionWithAI,
} from '../../api/client';
import { useDemoRole } from '../../context/DemoRoleContext';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { SimulatedBadge } from '../common/SimulatedBadge';
import { AIAuditReportCard, AIAuditData } from '../ai/AIAuditReportCard';
import {
  CheckCircle2,
  Lock,
  Clock,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  FileText,
  AlertCircle,
  Plus,
  Send,
  Cpu,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { formatMoney, safeHref } from '../../lib/money';

interface MilestoneDetailViewProps {
  milestone: MilestoneItem;
  currency?: string;
  onRefresh: () => void;
}

export const MilestoneDetailView: React.FC<MilestoneDetailViewProps> = ({
  milestone,
  currency = 'USD',
  onRefresh,
}) => {
  const { activeRole } = useDemoRole();
  const [newCriterion, setNewCriterion] = useState('');
  const [isAddingCriterion, setIsAddingCriterion] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAuditingAI, setIsAuditingAI] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Freelancer submission form state
  const [isSubmittingDeliverable, setIsSubmittingDeliverable] = useState(false);
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableSummary, setDeliverableSummary] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [evidenceText, setEvidenceText] = useState('');

  const latestSubmission = milestone.submissions?.[0];
  const latestAIReview = latestSubmission?.aiReviews?.[0] as AIAuditData | undefined;
  const payment = milestone.currentPayment;
  // Amount/criteria are frozen by the server once a milestone is funded/active.
  const termsLocked = !(
    milestone.status === 'DRAFT' || milestone.status === 'AWAITING_PAYMENT_AUTH'
  );
  const canAudit = milestone.status === 'SUBMITTED' || milestone.status === 'AI_REVIEWED';

  // Add Acceptance Criterion
  const handleAddCriterion = async () => {
    if (!newCriterion.trim()) return;
    try {
      setIsUpdating(true);
      const updatedCriteria = [...milestone.acceptanceCriteria, newCriterion.trim()];
      await updateMilestone(milestone.id, {
        acceptanceCriteria: updatedCriteria,
      });
      setNewCriterion('');
      setIsAddingCriterion(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to add criterion:', err);
      setActionError(getApiErrorMessage(err, 'Failed to add criterion'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Freelancer Submit Deliverable
  const handleSubmitDeliverable = async () => {
    if (!deliverableSummary.trim() || !deliverableUrl.trim()) {
      alert('Please provide a deliverable summary and a valid URL.');
      return;
    }

    try {
      setIsSubmittingDeliverable(true);
      setAuditError(null);
      await submitDeliverable(milestone.id, {
        summary: deliverableSummary.trim(),
        deliverableUrl: deliverableUrl.trim(),
        notes: submissionNotes.trim() || undefined,
        uploadedEvidenceText: evidenceText.trim() || undefined,
      });

      // Clear form
      setDeliverableUrl('');
      setDeliverableSummary('');
      setSubmissionNotes('');
      setEvidenceText('');
      onRefresh();
    } catch (err: any) {
      console.error('Failed to submit deliverable:', err);
      alert(err.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setIsSubmittingDeliverable(false);
    }
  };

  // Feature 2: Trigger AI Evidence Audit with Gemini
  const handleRunAIAudit = async () => {
    if (!latestSubmission) {
      alert('No submission found to audit.');
      return;
    }

    try {
      setIsAuditingAI(true);
      setAuditError(null);
      await auditSubmissionWithAI(latestSubmission.id);
      onRefresh();
    } catch (err: any) {
      console.error('AI Audit failed:', err);
      const errMsg =
        err.response?.data?.error ||
        err.message ||
        'AI Audit failed. Ensure GEMINI_API_KEY is configured on the server.';
      setAuditError(errMsg);
    } finally {
      setIsAuditingAI(false);
    }
  };

  // Client Approval Transitions
  const handleClientAuthorize = async () => {
    try {
      setIsUpdating(true);
      setActionError(null);
      await transitionMilestone(milestone.id, 'IN_PROGRESS');
      onRefresh();
    } catch (err) {
      console.error('Failed to authorize milestone:', err);
      setActionError(getApiErrorMessage(err, 'Failed to authorize milestone'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClientApprove = async () => {
    try {
      setIsUpdating(true);
      setActionError(null);
      await transitionMilestone(milestone.id, 'COMPLETED');
      onRefresh();
    } catch (err) {
      console.error('Failed to approve milestone:', err);
      setActionError(getApiErrorMessage(err, 'Failed to approve milestone'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClientRequestRevision = async () => {
    try {
      setIsUpdating(true);
      setActionError(null);
      await transitionMilestone(milestone.id, 'REVISION_REQUESTED');
      onRefresh();
    } catch (err) {
      console.error('Failed to request revision:', err);
      setActionError(getApiErrorMessage(err, 'Failed to request revision'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Milestone Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-subtle space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Milestone #{milestone.orderIndex}
              </span>
              <Badge status={milestone.status} showIcon />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {milestone.title}
            </h2>
          </div>

          <div className="text-left sm:text-right bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2 sm:self-start">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Milestone Allocation
            </div>
            <div className="text-lg font-bold text-slate-900">
              {formatMoney(milestone.amountMinor, milestone.currency)}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {milestone.description}
        </p>

        {/* Milestone Payment Card (development simulation only) */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Lock className="w-4 h-4 text-slate-500" />
              Payment Record
            </div>
            {(payment?.simulated ?? true) && <SimulatedBadge />}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">
                {payment?.simulated === false ? 'PayPal Order ID' : 'Dev Order Reference'}
              </span>
              <span className="font-mono text-slate-800 text-[11px] font-semibold">
                {payment?.orderId || '—'}
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">
                Record Status
              </span>
              <span className="font-semibold text-slate-700 text-[11px]">
                {payment?.status === 'CAPTURED'
                  ? payment.simulated === false
                    ? 'Captured'
                    : 'Simulated release (no funds moved)'
                  : payment?.status === 'AUTHORIZED'
                  ? payment.simulated === false
                    ? 'Authorized'
                    : 'Simulated authorization (no funds held)'
                  : 'No payment record yet'}
              </span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">
                Provider
              </span>
              <span className="text-slate-700 text-[11px]">
                {payment?.provider === 'PAYPAL' && payment.simulated === false
                  ? 'PayPal'
                  : 'Development (LOCAL_DEV)'}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-white/60 p-2 rounded border border-slate-200/60 leading-relaxed">
            <strong className="text-slate-700">Development mode:</strong> PayPal is not integrated yet.
            Authorization and release shown here are simulated records only. No funds are reserved,
            captured, or transferred. A PayPal authorization is also not escrow.
          </div>
        </div>
      </div>

      {/* Acceptance Criteria Matrix Card */}
      <Card
        title="Agreed Acceptance Criteria"
        subtitle="Verifiable benchmarks required for milestone sign-off and payment release"
        action={
          !isAddingCriterion && activeRole === 'CLIENT' && !termsLocked && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsAddingCriterion(true)}
            >
              Add Criterion
            </Button>
          )
        }
      >
        <div className="space-y-3">
          {milestone.acceptanceCriteria.length === 0 ? (
            <div className="text-xs text-slate-400 italic py-4 text-center">
              No acceptance criteria defined yet for this milestone.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {milestone.acceptanceCriteria.map((criterion, idx) => (
                <div
                  key={idx}
                  className="py-3 flex items-start gap-3 first:pt-0 last:pb-0"
                >
                  <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-[11px] font-semibold mt-0.5 shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 text-xs text-slate-700 font-medium leading-relaxed">
                    {criterion}
                  </div>
                  <Badge variant="neutral" size="sm">
                    {milestone.status === 'COMPLETED' ? 'Verified' : 'Pending Verification'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Add Criterion Input */}
          {isAddingCriterion && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <input
                type="text"
                placeholder="e.g. Inbound webhooks validated with HMAC SHA-256 signature..."
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCriterion()}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAddingCriterion(false);
                    setNewCriterion('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={isUpdating}
                  onClick={handleAddCriterion}
                >
                  Save Criterion
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Deliverable & Evidence Section */}
      <Card
        title="Deliverable Submissions & Accessible Evidence"
        subtitle="Inspect deliverables and concrete evidence submitted by freelancer"
        action={
          latestSubmission && canAudit && (
            <Button
              size="sm"
              variant="outline"
              isLoading={isAuditingAI}
              onClick={handleRunAIAudit}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-indigo-600" />}
            >
              {latestAIReview ? 'Re-run AI Evidence Audit' : 'Audit Evidence with AI'}
            </Button>
          )
        }
      >
        {auditError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{auditError}</span>
          </div>
        )}

        {latestSubmission ? (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-600" />
                  Submission #{latestSubmission.id.substring(0, 8)}
                </span>
                <span className="text-[11px] text-slate-500">
                  {new Date(latestSubmission.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-500 block uppercase">
                  Deliverable Summary
                </span>
                <p className="text-slate-800 mt-0.5 leading-relaxed">
                  {latestSubmission.summary}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-500 block uppercase">
                  Verified Deliverable URL
                </span>
                {safeHref(latestSubmission.deliverableUrl) ? (
                  <a
                    href={safeHref(latestSubmission.deliverableUrl) as string}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 mt-0.5 break-all"
                  >
                    {latestSubmission.deliverableUrl}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-rose-700 text-xs font-medium mt-0.5 block">
                    Link withheld: this URL is not a valid http(s) address.
                  </span>
                )}
              </div>

              {latestSubmission.uploadedEvidenceText && (
                <div>
                  <span className="text-[11px] font-medium text-slate-500 block uppercase mb-1">
                    Accessible Evidence Artifact (Code / Benchmark Data)
                  </span>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-[11px] font-mono leading-normal max-h-48">
                    {latestSubmission.uploadedEvidenceText.trim()}
                  </pre>
                </div>
              )}
            </div>

            {/* AI Review Display */}
            {latestAIReview ? (
              <AIAuditReportCard audit={latestAIReview} />
            ) : !canAudit ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                AI audits are only available while submitted work is awaiting review.
              </div>
            ) : (
              <div className="p-4 bg-indigo-50/50 border border-indigo-200/70 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-indigo-950">
                <div className="space-y-0.5">
                  <div className="font-semibold flex items-center gap-1.5 text-xs">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    AI Acceptance Criteria Audit Ready
                  </div>
                  <p className="text-[11px] text-indigo-800">
                    Deliverable evidence submitted. Click to have Google Gemini evaluate each criterion objectively.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={isAuditingAI}
                  onClick={handleRunAIAudit}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                >
                  Run AI Audit
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-center text-xs text-slate-500">
              No deliverable has been submitted for this milestone yet.
            </div>

            {/* Freelancer Submission Form */}
            {activeRole === 'FREELANCER' && (
              <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-600" />
                    Submit Deliverable as Marcus Chen
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Freelancer Workspace
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Deliverable URL (GitHub PR / Staging Link / Demo) *
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://github.com/org/repo/pull/12"
                      value={deliverableUrl}
                      onChange={(e) => setDeliverableUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Summary of Completed Work *
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Detailed explanation of how the agreed acceptance criteria were met..."
                      value={deliverableSummary}
                      onChange={(e) => setDeliverableSummary(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Accessible Evidence Text (Paste code snippets, benchmark logs, JSON results for Gemini evaluation)
                    </label>
                    <textarea
                      rows={4}
                      placeholder="// Paste code functions or test logs here so Gemini can verify them directly..."
                      value={evidenceText}
                      onChange={(e) => setEvidenceText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="primary"
                      isLoading={isSubmittingDeliverable}
                      onClick={handleSubmitDeliverable}
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                    >
                      Submit for AI Review & Client Approval
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Role-Specific Action Workspace Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              {activeRole === 'CLIENT' ? 'Client Authority' : 'Freelancer Workspace'}
            </span>
            <span className="text-xs text-slate-400">
              {activeRole === 'CLIENT' ? 'Elena Vance' : 'Marcus Chen'}
            </span>
          </div>
          <p className="text-xs text-slate-300 pt-1">
            {activeRole === 'CLIENT'
              ? 'Only you can approve a milestone. AI audits are strictly advisory. Payments are simulated in development mode.'
              : 'Submit deliverables with accessible evidence text for AI evaluation.'}
          </p>
        </div>

        {actionError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {activeRole === 'CLIENT' && (
            <>
              {milestone.status === 'AWAITING_PAYMENT_AUTH' && (
                <Button
                  size="sm"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                  leftIcon={<Lock className="w-3.5 h-3.5" />}
                  isLoading={isUpdating}
                  onClick={handleClientAuthorize}
                >
                  Authorize Funding — Simulated ({formatMoney(milestone.amountMinor, milestone.currency)})
                </Button>
              )}

              {(milestone.status === 'SUBMITTED' || milestone.status === 'AI_REVIEWED') && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
                    isLoading={isUpdating}
                    onClick={handleClientRequestRevision}
                  >
                    Request Revision
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    isLoading={isUpdating}
                    onClick={handleClientApprove}
                  >
                    Approve Milestone — Simulated, No Funds Move ({formatMoney(milestone.amountMinor, milestone.currency)})
                  </Button>
                </>
              )}

              {milestone.status === 'COMPLETED' && (
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Milestone Approved (simulated — no real payment)
                </div>
              )}
            </>
          )}

          {activeRole === 'FREELANCER' && (
            <div className="text-xs text-slate-300">
              {milestone.status === 'AWAITING_PAYMENT_AUTH'
                ? 'Pending client funding authorization (simulated in development) before work begins.'
                : milestone.status === 'COMPLETED'
                ? 'Milestone approved by the client. No real payment was made in development mode.'
                : milestone.status === 'REVISION_REQUESTED'
                ? 'The client requested a revision. Submit an updated deliverable.'
                : milestone.status === 'IN_PROGRESS'
                ? 'Work in progress. Submit your deliverable when ready.'
                : 'Deliverable submitted. Awaiting client review.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
