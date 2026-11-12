import React from 'react';
import { ProjectItem } from '../../api/client';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  ArrowRight,
  Lock,
  CheckCircle2,
  Calendar,
  Layers,
  User,
  ShieldCheck,
} from 'lucide-react';
import { formatMoney } from '../../lib/money';

interface ProjectCardProps {
  project: ProjectItem;
  onOpenProject: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpenProject,
}) => {
  const { stats, milestones, client, freelancer } = project;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-subtle hover:border-slate-300 transition-all space-y-4">
      {/* Header: Title and Status */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              {project.title}
            </h3>
            <Badge
              variant={project.status === 'COMPLETED' ? 'success' : 'info'}
              size="sm"
            >
              {project.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">
            Total Contract
          </span>
          <span className="text-base font-bold text-slate-900">
            {formatMoney(project.totalBudgetMinor, project.currency)}
          </span>
        </div>
      </div>

      {/* Counterparties */}
      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600 border-t border-slate-100">
        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-200/60">
          <span className="text-slate-400 text-[10px] uppercase font-semibold">
            Client:
          </span>
          <span className="font-semibold text-slate-800">
            {client?.name || 'Elena Vance'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-200/60">
          <span className="text-slate-400 text-[10px] uppercase font-semibold">
            Freelancer:
          </span>
          <span className="font-semibold text-slate-800">
            {freelancer?.name || 'Marcus Chen'}
          </span>
        </div>
      </div>

      {/* Milestone Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-600 font-medium flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            Milestone Progress:
          </span>
          <span className="font-semibold text-slate-800">
            {stats.completedMilestones} of {stats.totalMilestones} Completed ({stats.progressPercent}%)
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${stats.progressPercent}%` }}
          />
        </div>
      </div>

      {/* Financial Rail Status Indicators */}
      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
          <span className="text-[10px] text-slate-400 block font-medium uppercase">
            Authorized (Simulated)
          </span>
          <span className="font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
            <Lock className="w-3 h-3 text-emerald-600" />
            {formatMoney(stats.authorizedAmountMinor, project.currency)}
          </span>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
          <span className="text-[10px] text-slate-400 block font-medium uppercase">
            Released (Simulated)
          </span>
          <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {formatMoney(stats.capturedAmountMinor, project.currency)}
          </span>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
        <span className="text-[11px] text-slate-400 font-mono">
          {milestones.length} Sequential Milestones
        </span>

        <Button
          size="sm"
          variant="primary"
          rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          onClick={() => onOpenProject(project.id)}
        >
          Open Workspace
        </Button>
      </div>
    </div>
  );
};
