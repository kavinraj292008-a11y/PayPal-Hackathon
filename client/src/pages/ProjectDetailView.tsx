import React, { useState } from 'react';
import { ProjectItem, MilestoneItem } from '../api/client';
import { MilestoneTimeline } from '../components/milestones/MilestoneTimeline';
import { MilestoneDetailView } from '../components/milestones/MilestoneDetailView';
import { Badge } from '../components/common/Badge';
import { SimulatedBadge } from '../components/common/SimulatedBadge';
import { Card } from '../components/common/Card';
import {
  ArrowLeft,
  Lock,
  CheckCircle2,
  Layers,
  FileCheck2,
  CreditCard,
  ShieldAlert,
} from 'lucide-react';
import { formatMoney } from '../lib/money';

interface ProjectDetailViewProps {
  project: ProjectItem;
  onBack: () => void;
  onRefresh: () => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  project,
  onBack,
  onRefresh,
}) => {
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>(() => {
    const active = project.milestones.find((m: MilestoneItem) => m.status !== 'COMPLETED');
    return active ? active.id : project.milestones[0]?.id || '';
  });

  const [activeTab, setActiveTab] = useState<'WORKSPACE' | 'MATRIX' | 'LEDGER'>(
    'WORKSPACE'
  );

  const selectedMilestone =
    project.milestones.find((m: MilestoneItem) => m.id === selectedMilestoneId) ||
    project.milestones[0];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects Dashboard
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
            Project ID: {project.id}
          </span>
          <Badge
            variant={project.status === 'COMPLETED' ? 'success' : 'info'}
            size="sm"
          >
            {project.status}
          </Badge>
        </div>
      </div>

      {/* Project Banner Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-subtle space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {project.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {project.description}
            </p>
          </div>

          <div className="text-left md:text-right bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shrink-0">
            <span className="text-[11px] text-slate-400 block font-medium uppercase tracking-wider">
              Total Contract Budget
            </span>
            <div className="text-2xl font-bold text-slate-900">
              {formatMoney(project.totalBudgetMinor, project.currency)}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium flex items-center md:justify-end gap-1 mt-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              {formatMoney(project.stats.authorizedAmountMinor, project.currency)} Authorized (simulated)
            </div>
          </div>
        </div>

        {/* Counterparty Badges */}
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 uppercase font-semibold text-[10px]">
              Client:
            </span>
            <span className="font-semibold text-slate-900">
              {project.client?.name || 'Elena Vance'}
            </span>
            <span className="text-slate-500 text-[11px]">
              ({project.client?.title || 'VP of Product'})
            </span>
          </div>

          <span className="text-slate-300">•</span>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 uppercase font-semibold text-[10px]">
              Freelancer:
            </span>
            <span className="font-semibold text-slate-900">
              {project.freelancer?.name || 'Marcus Chen'}
            </span>
            <span className="text-slate-500 text-[11px]">
              ({project.freelancer?.title || 'Senior Systems Architect'})
            </span>
          </div>

          <span className="text-slate-300">•</span>

          <div className="flex items-center gap-1.5 text-slate-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {project.stats.completedMilestones} of {project.stats.totalMilestones} Milestones Completed
            </span>
          </div>
        </div>
      </div>

      {/* Workspace Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('WORKSPACE')}
          className={`pb-3 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'WORKSPACE'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Milestones & Verification Workspace
        </button>

        <button
          onClick={() => setActiveTab('MATRIX')}
          className={`pb-3 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'MATRIX'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          Acceptance Criteria Matrix
        </button>

        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`pb-3 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'LEDGER'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Payment Authorization Rails & Ledger
        </button>
      </div>

      {/* Tab 1: Workspace */}
      {activeTab === 'WORKSPACE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Milestone List / Stepper */}
          <div className="lg:col-span-4">
            <MilestoneTimeline
              milestones={project.milestones}
              selectedMilestoneId={selectedMilestoneId}
              onSelectMilestone={(id: string) => setSelectedMilestoneId(id)}
              currency={project.currency}
            />
          </div>

          {/* Right Column: Selected Milestone Details */}
          <div className="lg:col-span-8">
            {selectedMilestone ? (
              <MilestoneDetailView
                milestone={selectedMilestone}
                currency={project.currency}
                onRefresh={onRefresh}
              />
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded-xl">
                No milestone selected.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Acceptance Criteria Matrix Table */}
      {activeTab === 'MATRIX' && (
        <Card
          title="Contract Acceptance Criteria Matrix"
          subtitle="All verifiable benchmarks across the complete project lifecycle"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Milestone</th>
                  <th className="py-3 px-4">Budget</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Agreed Acceptance Criteria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {project.milestones.map((m: MilestoneItem, idx: number) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {m.title}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {formatMoney(m.amountMinor, project.currency)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge status={m.status} size="sm" showIcon />
                    </td>
                    <td className="py-3 px-4">
                      <ul className="space-y-1">
                        {m.acceptanceCriteria.map((c: string, cIdx: number) => (
                          <li key={cIdx} className="flex items-start gap-1.5">
                            <span className="text-slate-400">•</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 3: Payment Ledger & Rails */}
      {activeTab === 'LEDGER' && (
        <Card
          title="Payment Records (Development Simulation)"
          subtitle="Simulated records only. PayPal is not integrated and no real funds move"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Milestone</th>
                  <th className="py-3 px-4">Order Reference</th>
                  <th className="py-3 px-4">Authorization ID</th>
                  <th className="py-3 px-4">Release Reference</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Record Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                {project.milestones.map((m: MilestoneItem) => {
                  const pay = m.currentPayment;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900 text-xs">
                        #{m.orderIndex} {m.title}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        {pay?.orderId || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        {pay?.authorizationId || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-800">
                        {pay?.captureId || '—'}
                      </td>
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900 text-xs">
                        {formatMoney(m.amountMinor, project.currency)}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        {pay ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge status={pay.status as any} size="sm" showIcon>
                              {pay.simulated !== false
                                ? pay.status === 'CAPTURED'
                                  ? 'Released'
                                  : pay.status === 'AUTHORIZED'
                                  ? 'Authorized'
                                  : undefined
                                : undefined}
                            </Badge>
                            {pay.simulated !== false && <SimulatedBadge />}
                          </span>
                        ) : (
                          <span className="text-slate-400">No record</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2 font-sans">
            <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>Development simulation:</strong> these records are created by the local development provider (<code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">LOCAL_DEV</code>). No PayPal order, authorization or capture exists, and no funds are held or transferred. Real PayPal integration is a later phase.
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
