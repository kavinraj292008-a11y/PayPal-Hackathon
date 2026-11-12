import React, { useState } from 'react';
import { useDemoRole } from '../../context/DemoRoleContext';
import { resetDemoData, getApiErrorMessage } from '../../api/client';
import { UserCheck, RefreshCw, AlertCircle } from 'lucide-react';

export const DemoBanner: React.FC = () => {
  const { activeRole, setRole, currentUser, refreshUsers } = useDemoRole();
  const [isResetting, setIsResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleReset = async () => {
    try {
      setIsResetting(true);
      setResetError(null);
      await resetDemoData();
      await refreshUsers();
      setResetMsg('Demo records reset');
      setTimeout(() => setResetMsg(null), 3000);
      // Reloaded data may no longer match what is on screen.
      window.location.reload();
    } catch (err: any) {
      console.error('Reset failed:', err);
      const forbidden = err?.response?.status === 403;
      setResetError(
        forbidden
          ? 'Reset is disabled on this server (requires DEMO_MODE=true and a non-production environment).'
          : getApiErrorMessage(err, 'Reset failed')
      );
      setTimeout(() => setResetError(null), 8000);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="bg-slate-900 text-white border-b border-slate-800 text-xs px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Demo Environment Badge & Regulatory Notice */}
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-amber-400 text-slate-950 uppercase text-[10px] tracking-wider">
            DEMO MODE
          </span>
          <span className="text-slate-300 hidden md:inline">
            Non-custodial milestone coordination simulator. Not production authentication.
          </span>
        </div>

        {/* Center/Right: Role Switcher Controls */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px] font-medium mr-1">Switch Perspective:</span>
          
          <button
            onClick={() => setRole('CLIENT')}
            className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition-all ${
              activeRole === 'CLIENT'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Client (Elena Vance)
          </button>

          <button
            onClick={() => setRole('FREELANCER')}
            className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition-all ${
              activeRole === 'FREELANCER'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Freelancer (Marcus Chen)
          </button>

          <button
            onClick={handleReset}
            disabled={isResetting}
            title="Reset SQLite database with clean seeded data"
            className="ml-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center gap-1 transition"
          >
            <RefreshCw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
            {resetMsg ? resetMsg : 'Reset Data'}
          </button>
          {resetError && (
            <span role="alert" className="flex items-center gap-1 text-rose-300 text-[11px] max-w-xs">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {resetError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
