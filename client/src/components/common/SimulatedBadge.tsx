import React from 'react';
import { FlaskConical } from 'lucide-react';

/** Marks any development payment record. Never shown on genuine PayPal transactions. */
export const SimulatedBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    title="Simulated development record. No PayPal request was made and no real funds moved."
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider ${className}`}
  >
    <FlaskConical className="w-3 h-3" />
    Simulated
  </span>
);
