import React, { useState } from 'react';
import { ProjectItem, MilestoneItem } from '../api/client';
import { ProjectCard } from '../components/projects/ProjectCard';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { useDemoRole } from '../context/DemoRoleContext';
import {
  Plus,
  Lock,
  CheckCircle2,
  Clock,
  Layers,
  Search,
} from 'lucide-react';
import { formatTotals, sumByCurrency } from '../lib/money';

interface DashboardViewProps {
  projects: ProjectItem[];
  isLoading: boolean;
  onOpenProject: (id: string) => void;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  isLoading,
  onOpenProject,
  onRefresh,
}) => {
  const { activeRole } = useDemoRole();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate real metrics from current database projects
  // Exact integer minor-unit sums, grouped per currency (currencies are never added together).
  const totalVolume = sumByCurrency(projects, (p) => ({ minor: p.totalBudgetMinor, currency: p.currency }));
  const totalAuthorized = sumByCurrency(projects, (p) => ({ minor: p.stats?.authorizedAmountMinor || 0, currency: p.currency }));
  const totalCaptured = sumByCurrency(projects, (p) => ({ minor: p.stats?.capturedAmountMinor || 0, currency: p.currency }));
  const pendingReviewsCount = projects.reduce(
    (count, p) =>
      count +
      p.milestones.filter(
        (m: MilestoneItem) => m.status === 'SUBMITTED' || m.status === 'AI_REVIEWED'
      ).length,
    0
  );

  const filteredProjects = projects.filter((p) => {
    const matchesTab =
      filterTab === 'ALL'
        ? true
        : filterTab === 'ACTIVE'
        ? p.status === 'ACTIVE' || p.status === 'DRAFT'
        : p.status === 'COMPLETED';

    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Portfolio Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              Total Contract Volume
            </span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {formatTotals(totalVolume)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Across {projects.length} coordinated projects
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              Authorized (Held on Rails)
            </span>
            <Lock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 tracking-tight">
            {formatTotals(totalAuthorized)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Simulated authorizations (development only)
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              Submissions in Review
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {pendingReviewsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Awaiting AI check & client sign-off
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              Simulated Releases
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tracking-tight">
            {formatTotals(totalCaptured)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Approved by the client. No real funds moved
          </div>
        </div>
      </div>

      {/* Control Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-subtle">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filterTab === 'ALL'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Projects ({projects.length})
          </button>
          <button
            onClick={() => setFilterTab('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filterTab === 'ACTIVE'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Workspaces
          </button>
          <button
            onClick={() => setFilterTab('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filterTab === 'COMPLETED'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Completed
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg w-48 sm:w-64 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            New Project
          </Button>
        </div>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading coordinated workspaces...
        </div>
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-6 h-6" />}
          title="No Projects Found"
          description={
            searchQuery
              ? `No projects match your filter query "${searchQuery}".`
              : 'Create your first milestone-coordinated project to begin.'
          }
          actionLabel="Create Project"
          onAction={() => setIsCreateModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpenProject={onOpenProject}
            />
          ))}
        </div>
      )}

      {/* Project Creation Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onProjectCreated={(newProject: ProjectItem) => {
          onRefresh();
          onOpenProject(newProject.id);
        }}
      />
    </div>
  );
};
