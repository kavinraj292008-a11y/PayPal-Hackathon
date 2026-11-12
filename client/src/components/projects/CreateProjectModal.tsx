import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { createProject, generateMilestonesWithAI, getApiErrorMessage, ProjectItem } from '../../api/client';
import { formatMoney, minorToDecimalString, parseAmountToMinor } from '../../lib/money';
import { useDemoRole } from '../../context/DemoRoleContext';
import {
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Clock,
  Layers,
} from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: ProjectItem) => void;
}

interface MilestoneDraft {
  title: string;
  description: string;
  amount: number;
  deadline?: string;
  acceptanceCriteria: string[];
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const { allDemoUsers } = useDemoRole();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [clientConfirmed, setClientConfirmed] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalBudget, setTotalBudget] = useState<number>(6000);
  const [currency] = useState('USD');
  const [estimatedWeeks, setEstimatedWeeks] = useState<number>(4);
  const [clientRequirements, setClientRequirements] = useState('');
  const [freelancerId, setFreelancerId] = useState('demo-freelancer-marcus');

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    {
      title: 'Phase 1: Architecture & Data Ingestion Schema',
      description: 'Domain specifications, schema migrations, and batch ingestion tests.',
      amount: 2500,
      acceptanceCriteria: [
        'Prisma relational schema with strict indexes',
        'Zod batch payload validation',
        'Test coverage surpassing 90%',
      ],
    },
    {
      title: 'Phase 2: Reconciliation & Settlement Pipeline',
      description: 'Double-entry settlement pipeline and PayPal webhook handler.',
      amount: 3500,
      acceptanceCriteria: [
        'Atomic transaction wrapper around ledger mutations',
        'Sub-second matching performance on 5k transactions',
        'HMAC SHA-256 webhook signature verification',
      ],
    },
  ]);

  // Exact integer minor-unit arithmetic (no floating-point money math). The server re-validates everything.
  const totalMinor = parseAmountToMinor(totalBudget, currency) ?? 0;
  const allocatedMinor = milestones.reduce((sum, m) => sum + (parseAmountToMinor(m.amount, currency) ?? 0), 0);
  const allAmountsValid = milestones.every((m) => parseAmountToMinor(m.amount, currency) !== null);
  const isBudgetBalanced = totalMinor > 0 && allAmountsValid && allocatedMinor === totalMinor;

  const loadPresetTemplate = () => {
    setTitle('Automated Cross-Border Liquidity Engine');
    setDescription(
      'Development of a microservice that coordinates multi-currency liquidity rebalancing, executes ISO 20022 messaging, and generates daily cryptographic audit proofs.'
    );
    setTotalBudget(7500);
    setMilestones([
      {
        title: 'Core Messaging & ISO 20022 Parser',
        description: 'Parse, validate, and normalize SWIFT and ISO 20022 payment messages.',
        amount: 2500,
        acceptanceCriteria: [
          'Support pacs.008 and camt.053 message types',
          'Strict XML schema validation without memory leaks',
          'Zero data loss on truncated message payload test',
        ],
      },
      {
        title: 'Liquidity Rebalancer & Arbitrage Monitor',
        description: 'Smart routing for cross-currency rebalancing batches.',
        amount: 3000,
        acceptanceCriteria: [
          'Deterministic FX rate lookup with 10-second TTL cache',
          'Automated rebalancing batch generation under threshold rules',
          'Full unit tests simulating volatile spread scenarios',
        ],
      },
      {
        title: 'PayPal Disbursement & Reconciliation Adapter',
        description: 'End-to-end PayPal Orders v2 integration with authorization lifecycle.',
        amount: 2000,
        acceptanceCriteria: [
          'Separate PayPal order per milestone with authorization tracking',
          'Idempotent webhook dispatcher with exponential backoff',
          'Audited end-of-day CSV reconciliation export',
        ],
      },
    ]);
    setAiNotice('Loaded standard fintech scope template.');
  };

  // Feature 1: AI Milestone Generation with Gemini
  const handleGenerateMilestonesAI = async () => {
    if (!title.trim() || !description.trim()) {
      setError('Please provide a project title and description before generating milestones with AI.');
      return;
    }
    if (totalMinor <= 0) {
      setError('Please specify a valid total project budget (a positive amount with at most 2 decimals).');
      return;
    }

    try {
      setIsGeneratingAI(true);
      setError(null);
      setAiNotice('Decomposing scope into verifiable milestones using Google Gemini...');

      const res = await generateMilestonesWithAI({
        projectTitle: title.trim(),
        projectDescription: description.trim(),
        totalBudget: minorToDecimalString(totalMinor, currency),
        currency,
        estimatedWeeks,
        clientRequirements: clientRequirements.trim() || undefined,
      });

      if (res.milestones && res.milestones.length > 0) {
        setMilestones(
          res.milestones.map((m) => ({
            title: m.title,
            description: m.description,
            amount: Number(m.amount),
            acceptanceCriteria: m.acceptanceCriteria,
          }))
        );
        setAiNotice(
          `Generated ${res.milestones.length} verifiable milestones using ${res.model}. Review and edit below.`
        );
      }
    } catch (err: any) {
      console.warn('AI generation error:', err);
      const errMsg =
        err.response?.data?.error ||
        err.message ||
        'AI generation failed. Check GEMINI_API_KEY or use the manual template.';
      setError(errMsg);
      setAiNotice(null);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAddMilestone = () => {
    const remainingMinor = Math.max(0, totalMinor - allocatedMinor);
    const remaining = Number(minorToDecimalString(remainingMinor, currency));
    setMilestones([
      ...milestones,
      {
        title: `Milestone ${milestones.length + 1}`,
        description: 'Define verifiable milestone requirements...',
        amount: remaining || 1000,
        acceptanceCriteria: ['Verifiable criterion 1', 'Verifiable criterion 2'],
      },
    ]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleUpdateMilestone = (index: number, field: keyof MilestoneDraft, value: any) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const handleAddCriterion = (milestoneIndex: number, criterion: string) => {
    if (!criterion.trim()) return;
    const updated = [...milestones];
    updated[milestoneIndex].acceptanceCriteria.push(criterion.trim());
    setMilestones(updated);
  };

  const handleRemoveCriterion = (milestoneIndex: number, criterionIndex: number) => {
    const updated = [...milestones];
    updated[milestoneIndex].acceptanceCriteria = updated[milestoneIndex].acceptanceCriteria.filter(
      (_, i) => i !== criterionIndex
    );
    setMilestones(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please provide a project title and description.');
      return;
    }
    if (milestones.length === 0) {
      setError('At least one milestone is required.');
      return;
    }
    if (!allAmountsValid) {
      setError('Every milestone amount must be a positive number with at most 2 decimals.');
      return;
    }
    if (!isBudgetBalanced) {
      setError(
        `Allocated milestone sum (${formatMoney(allocatedMinor, currency)}) must match the total contract budget (${formatMoney(totalMinor, currency)}).`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await createProject({
        title,
        description,
        totalBudget: minorToDecimalString(totalMinor, currency),
        currency,
        freelancerId,
        milestones: milestones.map((m) => ({
          title: m.title,
          description: m.description,
          amount: minorToDecimalString(parseAmountToMinor(m.amount, currency) as number, currency),
          currency,
          acceptanceCriteria: m.acceptanceCriteria,
        })),
      });

      onProjectCreated(created);
      onClose();
    } catch (err: any) {
      console.error('Failed to create project:', err);
      setError(getApiErrorMessage(err, 'Error creating project'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Milestone-Coordinated Project"
      subtitle="Define natural-language scope or let Google Gemini generate structured milestones"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* AI Action Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200/90 rounded-2xl p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Cpu className="w-4 h-4 text-emerald-600" />
              AI-Powered Milestone Decomposition
            </div>
            <p className="text-[11px] text-slate-500">
              Input project scope above and let Google Gemini draft balanced milestones and verifiable criteria.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={loadPresetTemplate}
              className="text-xs"
            >
              Load Sample Scope
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              isLoading={isGeneratingAI}
              onClick={handleGenerateMilestonesAI}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
              className="text-xs"
            >
              {milestones.length > 0 ? 'Regenerate with AI' : 'Generate with AI'}
            </Button>
          </div>
        </div>

        {aiNotice && (
          <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{aiNotice}</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section 1: Project Scope */}
        <div className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            1. Contract Scope & Budget
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Multi-Currency Liquidity Settlement Engine"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Description (Natural Language Scope)
              </label>
              <textarea
                rows={3}
                required
                placeholder="Describe deliverables, architecture goals, APIs to integrate, and operational requirements..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Total Contract Budget (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-500 font-semibold">
                    $
                  </span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={totalBudget}
                    onChange={(e) => setTotalBudget(Number(e.target.value))}
                    className="w-full text-xs pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target Duration
                </label>
                <select
                  value={estimatedWeeks}
                  onChange={(e) => setEstimatedWeeks(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                >
                  <option value={2}>2 Weeks</option>
                  <option value={4}>4 Weeks (1 Month)</option>
                  <option value={6}>6 Weeks</option>
                  <option value={8}>8 Weeks (2 Months)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assignee (Demo Freelancer)
                </label>
                <select
                  value={freelancerId}
                  onChange={(e) => setFreelancerId(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                >
                  <option value="demo-freelancer-marcus">
                    Marcus Chen — Senior Distributed Systems Architect
                  </option>
                  {allDemoUsers
                    .filter((u) => u.role === 'FREELANCER' && u.id !== 'demo-freelancer-marcus')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Optional Client Requirements / Constraints (Guides AI Generation)
              </label>
              <input
                type="text"
                placeholder="e.g. Must include sandbox integration tests, sub-second latency, and ISO 20022 schemas"
                value={clientRequirements}
                onChange={(e) => setClientRequirements(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 text-slate-700"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Milestone Builder & Budget Allocation Tracker */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                2. Verifiable Milestone Plan ({milestones.length})
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Each milestone has independent authorization rails & acceptance criteria
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleAddMilestone}
            >
              Add Milestone
            </Button>
          </div>

          {/* Budget Allocation Progress Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-slate-700">
              <span>Budget Allocation:</span>
              <span className="font-semibold">
                {formatMoney(allocatedMinor, currency)} of {formatMoney(totalMinor, currency)}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isBudgetBalanced
                    ? 'bg-emerald-500'
                    : allocatedMinor > totalMinor
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }`}
                style={{
                  width: `${Math.min(100, Math.round((allocatedMinor / (totalMinor || 1)) * 100))}%`,
                }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span
                className={
                  isBudgetBalanced
                    ? 'text-emerald-700 font-medium'
                    : allocatedMinor > totalMinor
                    ? 'text-rose-700 font-medium'
                    : 'text-amber-700 font-medium'
                }
              >
                {isBudgetBalanced
                  ? '✓ 100% of contract budget allocated across milestones'
                  : allocatedMinor > totalMinor
                  ? `Over-allocated by ${formatMoney(allocatedMinor - totalMinor, currency)}`
                  : `Remaining to allocate: ${formatMoney(totalMinor - allocatedMinor, currency)}`}
              </span>
            </div>
          </div>

          {/* Milestone Cards List */}
          <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
            {milestones.map((m, index) => (
              <div
                key={index}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-subtle space-y-3 relative group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">
                      {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      Milestone #{index + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1.5 text-[11px] text-slate-500 font-semibold">
                        $
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={m.amount}
                        onChange={(e) =>
                          handleUpdateMilestone(index, 'amount', Number(e.target.value))
                        }
                        className="w-full text-xs pl-6 pr-2 py-1 border border-slate-300 rounded-md font-semibold text-right"
                      />
                    </div>

                    {milestones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMilestone(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Remove milestone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    placeholder="Milestone Title..."
                    value={m.title}
                    onChange={(e) => handleUpdateMilestone(index, 'title', e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md font-medium"
                  />

                  <textarea
                    rows={2}
                    placeholder="Milestone description..."
                    value={m.description}
                    onChange={(e) =>
                      handleUpdateMilestone(index, 'description', e.target.value)
                    }
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>

                {/* Acceptance Criteria Chips */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-[11px] font-medium text-slate-600">
                    Verifiable Acceptance Criteria ({m.acceptanceCriteria.length})
                  </label>
                  <div className="space-y-1">
                    {m.acceptanceCriteria.map((c, cIdx) => (
                      <div
                        key={cIdx}
                        className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-200"
                      >
                        <span className="truncate text-slate-700 font-medium">
                          • {c}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(index, cIdx)}
                          className="text-slate-400 hover:text-rose-600 text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="+ Type criterion and press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCriterion(index, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                    className="w-full text-[11px] px-2 py-1 border border-slate-200 rounded focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Client Confirmation Checkbox */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={clientConfirmed}
              onChange={(e) => setClientConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span className="text-[11px] leading-relaxed">
              <strong>Human Client Sign-Off:</strong> I have reviewed and explicitly approved this milestone allocation and acceptance criteria plan. AI suggestions were advisory and not automatically saved without confirmation.
            </span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={!isBudgetBalanced || !clientConfirmed}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
          >
            Confirm & Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
};
