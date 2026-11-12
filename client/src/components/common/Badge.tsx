import React from 'react';
import { Lock, CheckCircle2, Clock, AlertCircle, Sparkles } from 'lucide-react';

export interface BadgeProps {
  children?: React.ReactNode;
  variant?:
    | 'default'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'neutral'
    | 'indigo'
    | 'status';
  status?:
    | 'DRAFT'
    | 'AWAITING_PAYMENT_AUTH'
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'AI_REVIEWED'
    | 'PAYMENT_APPROVED'
    | 'COMPLETED'
    | 'REVISION_REQUESTED'
    | 'AUTHORIZED'
    | 'CAPTURED'
    | 'EXPIRED'
    | 'VOIDED';
  size?: 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  status,
  size = 'md',
  className = '',
  showIcon = false,
}) => {
  const base =
    'inline-flex items-center font-medium rounded-full tracking-tight transition-colors whitespace-nowrap';

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  };

  if (status) {
    switch (status) {
      case 'COMPLETED':
      case 'CAPTURED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-emerald-50 text-emerald-800 border border-emerald-200/90 ${className}`}
          >
            {showIcon && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
            {children || (status === 'CAPTURED' ? 'Captured' : 'Completed')}
          </span>
        );
      case 'AUTHORIZED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-emerald-50 text-emerald-800 border border-emerald-300 font-medium ${className}`}
          >
            {showIcon && <Lock className="w-3 h-3 text-emerald-600" />}
            {children || 'Funds Authorized (Held)'}
          </span>
        );
      case 'AWAITING_PAYMENT_AUTH':
        return (
          <span
            className={`${base} ${sizes[size]} bg-amber-50 text-amber-800 border border-amber-200/90 ${className}`}
          >
            {showIcon && <Clock className="w-3 h-3 text-amber-600" />}
            {children || 'Awaiting Authorization'}
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span
            className={`${base} ${sizes[size]} bg-sky-50 text-sky-800 border border-sky-200 ${className}`}
          >
            {showIcon && <Clock className="w-3 h-3 text-sky-600" />}
            {children || 'In Progress'}
          </span>
        );
      case 'SUBMITTED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-blue-50 text-blue-800 border border-blue-200 ${className}`}
          >
            {showIcon && <Clock className="w-3 h-3 text-blue-600" />}
            {children || 'Deliverable Submitted'}
          </span>
        );
      case 'AI_REVIEWED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-indigo-50 text-indigo-800 border border-indigo-200 ${className}`}
          >
            {showIcon && <Sparkles className="w-3 h-3 text-indigo-600" />}
            {children || 'AI Audit Ready'}
          </span>
        );
      case 'PAYMENT_APPROVED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-teal-50 text-teal-800 border border-teal-200 font-medium ${className}`}
          >
            {showIcon && <CheckCircle2 className="w-3 h-3 text-teal-600" />}
            {children || 'Approved by Client'}
          </span>
        );
      case 'REVISION_REQUESTED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-rose-50 text-rose-800 border border-rose-200 ${className}`}
          >
            {showIcon && <AlertCircle className="w-3 h-3 text-rose-600" />}
            {children || 'Revision Requested'}
          </span>
        );
      case 'EXPIRED':
      case 'VOIDED':
        return (
          <span
            className={`${base} ${sizes[size]} bg-slate-100 text-slate-500 border border-slate-200 ${className}`}
          >
            {children || status}
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span
            className={`${base} ${sizes[size]} bg-slate-100 text-slate-700 border border-slate-200 ${className}`}
          >
            {children || 'Draft'}
          </span>
        );
    }
  }

  const variants = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    neutral: 'bg-zinc-100 text-zinc-800 border border-zinc-200',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    danger: 'bg-rose-50 text-rose-800 border border-rose-200',
    info: 'bg-sky-50 text-sky-800 border border-sky-200',
    indigo: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
    status: 'bg-slate-100 text-slate-700 border border-slate-200',
  };

  return (
    <span className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};
