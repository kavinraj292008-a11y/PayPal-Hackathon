import React from 'react';
import { useDemoRole } from '../../context/DemoRoleContext';
import { ShieldCheck, Cpu, CreditCard } from 'lucide-react';
import { Badge } from '../common/Badge';

interface NavbarProps {
  systemStatus?: {
    database: string;
    paymentProviderMode: string;
    aiConfigured: boolean;
  };
}

export const Navbar: React.FC<NavbarProps> = ({ systemStatus }) => {
  const { currentUser, activeRole } = useDemoRole();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            <span className="text-emerald-400">P</span>P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base tracking-tight text-slate-900">
                PROOFPAY
              </span>
              <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                v1.0-alpha
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-normal">
              Milestone-Based Payment Coordination
            </p>
          </div>
        </div>

        {/* Integration Status Indicators */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400">PayPal:</span>
            <span className="font-medium text-slate-700">
              {systemStatus?.paymentProviderMode === 'PAYPAL_SANDBOX'
                ? 'Sandbox Active'
                : 'Not integrated (simulated payments)'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400">Gemini:</span>
            <span className="font-medium text-slate-700">
              {systemStatus?.aiConfigured ? 'Ready' : 'API Key Ready'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200/80">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-slate-400">DB:</span>
            <span className="font-medium text-slate-700">
              {systemStatus?.database === 'CONNECTED' ? 'SQLite Connected' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Active Persona Profile */}
        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/90 rounded-lg px-3 py-1.5">
              {currentUser.avatarUrl && (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full object-cover border border-slate-300"
                />
              )}
              <div className="text-left">
                <div className="text-xs font-semibold text-slate-900 leading-tight">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {activeRole === 'CLIENT' ? 'Client' : 'Freelancer'}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-400">Loading persona...</span>
          )}
        </div>
      </div>
    </header>
  );
};
