import React, { useEffect, useState, useCallback } from 'react';
import { DemoBanner } from './components/layout/DemoBanner';
import { Navbar } from './components/layout/Navbar';
import { useDemoRole } from './context/DemoRoleContext';
import {
  fetchHealth,
  HealthResponse,
  fetchProjects,
  fetchProject,
  ProjectItem,
} from './api/client';
import { DashboardView } from './pages/DashboardView';
import { ProjectDetailView } from './pages/ProjectDetailView';
import { AlertTriangle } from 'lucide-react';

export const App: React.FC = () => {
  const { activeRole } = useDemoRole();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [isLoadingProjectDetail, setIsLoadingProjectDetail] = useState(false);

  // Load telemetry
  const loadHealth = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
      setHealthError(null);
    } catch (err: any) {
      console.error('Health check failed:', err);
      setHealthError(err.message || 'Unable to connect to ProofPay API');
    }
  }, []);

  // Load all projects
  const loadProjects = useCallback(async () => {
    try {
      setIsLoadingProjects(true);
      const list = await fetchProjects();
      setProjects(list);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Load single project if selected
  const loadSelectedProject = useCallback(async (id: string) => {
    try {
      setIsLoadingProjectDetail(true);
      const proj = await fetchProject(id);
      setSelectedProject(proj);
    } catch (err) {
      console.error('Failed to load project details:', err);
    } finally {
      setIsLoadingProjectDetail(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    loadProjects();
  }, [loadHealth, loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadSelectedProject(selectedProjectId);
    } else {
      setSelectedProject(null);
    }
  }, [selectedProjectId, loadSelectedProject]);

  const handleOpenProject = (id: string) => {
    setSelectedProjectId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToDashboard = () => {
    setSelectedProjectId(null);
    setSelectedProject(null);
    loadProjects();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefreshCurrentView = () => {
    loadProjects();
    if (selectedProjectId) {
      loadSelectedProject(selectedProjectId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] font-sans antialiased text-slate-900">
      <DemoBanner />
      <Navbar
        systemStatus={
          health
            ? {
                database: health.database,
                paymentProviderMode: health.paymentProviderMode,
                aiConfigured: health.aiConfigured,
              }
            : undefined
        }
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {healthError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-rose-900">
                Backend Connection Error
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                Ensure the server is running on port 5000: <code className="bg-rose-100 px-1 py-0.5 rounded">{healthError}</code>
              </p>
            </div>
          </div>
        )}

        {/* View Switcher: Dashboard vs Project Detail */}
        {selectedProjectId && selectedProject ? (
          <ProjectDetailView
            project={selectedProject}
            onBack={handleBackToDashboard}
            onRefresh={handleRefreshCurrentView}
          />
        ) : (
          <DashboardView
            projects={projects}
            isLoading={isLoadingProjects}
            onOpenProject={handleOpenProject}
            onRefresh={handleRefreshCurrentView}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <span>ProofPay © 2026. MIT Licensed. Built with React, Express & Prisma. PayPal integration pending; payments are simulated.</span>
          <span className="font-mono text-[11px] text-slate-400">Environment: Sandbox Demo Mode</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
