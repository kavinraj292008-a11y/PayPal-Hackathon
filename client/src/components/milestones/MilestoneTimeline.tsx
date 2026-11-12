import React from 'react';
import { MilestoneItem } from '../../api/client';
import { Badge } from '../common/Badge';
import { CheckCircle2, Lock, Clock, ArrowRight, ShieldCheck } from 'lucide-react';
import { formatMoney } from '../../lib/money';

interface MilestoneTimelineProps {
  milestones: MilestoneItem[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (id: string) => void;
  currency?: string;
}

export const MilestoneTimeline: React.FC<MilestoneTimelineProps> = ({
  milestones,
  selectedMilestoneId,
  onSelectMilestone,
  currency = 'USD',
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Project Milestones ({milestones.length})
        </h3>
        <span className="text-[11px] text-slate-400">Sequential Execution</span>
      </div>

      <div className="space-y-2">
        {milestones.map((m, index) => {
          const isSelected = m.id === selectedMilestoneId;
          const isCompleted = m.status === 'COMPLETED';
          const isAuthorized =
            m.currentPayment?.status === 'AUTHORIZED' ||
            m.status === 'IN_PROGRESS' ||
            m.status === 'SUBMITTED';

          return (
            <div
              key={m.id}
              onClick={() => onSelectMilestone(m.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-white border-slate-900 shadow-sm ring-1 ring-slate-900'
                  : 'bg-white/90 border-slate-200/90 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-800'
                        : isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : index + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 leading-tight">
                      {m.title}
                    </h4>
                    <span className="text-xs font-medium text-slate-500">
                      {formatMoney(m.amountMinor, m.currency || currency)}
                    </span>
                  </div>
                </div>

                <Badge status={m.status} size="sm" showIcon />
              </div>

              {/* Acceptance Criteria Counter & Rail Indicator */}
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {m.acceptanceCriteria.length} Acceptance Criteria
                  </span>
                </div>

                {isAuthorized && (
                  <span className="flex items-center gap-1 text-emerald-700 font-medium text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    <Lock className="w-2.5 h-2.5" /> Held on Rails
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
