import React from 'react';
import { Badge } from '../common/Badge';
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Cpu,
  Clock,
  Layers,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';

export interface CriterionResultItem {
  criterionId: string;
  status: 'SATISFIED' | 'PARTIALLY_SATISFIED' | 'NOT_SATISFIED' | 'INSUFFICIENT_EVIDENCE';
  score: number;
  reasoning: string;
  evidenceReference: string;
}

export interface AIAuditData {
  id?: string;
  overallScore: number;
  overallStatus?: string;
  /** % of criteria the evidence allowed a verdict on. NOT a probability that the verdicts are correct. */
  evidenceCoveragePercent?: number;
  scoringPolicyVersion?: string;
  recommendationReasons?: string[];
  summary: string;
  recommendation: 'APPROVE_RECOMMENDED' | 'REQUEST_REVISION' | 'MANUAL_REVIEW';
  criteriaResults: CriterionResultItem[];
  missingRequirements: string[];
  risks: string[];
  evidenceLimitations: string[];
  modelId?: string;
  model?: string;
  auditedAt?: string;
  createdAt?: string;
  advisoryNotice?: string;
}

interface AIAuditReportCardProps {
  audit: AIAuditData;
}

export const AIAuditReportCard: React.FC<AIAuditReportCardProps> = ({ audit }) => {
  const score = Math.round(audit.overallScore);
  const modelName = audit.modelId || audit.model || 'gemini-1.5-flash';
  const timestamp = audit.auditedAt || audit.createdAt || new Date().toISOString();

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case 'APPROVE_RECOMMENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Client Approval Recommended
          </span>
        );
      case 'REQUEST_REVISION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            Revision Recommended
          </span>
        );
      case 'MANUAL_REVIEW':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            Manual Client Review Recommended
          </span>
        );
    }
  };

  const getCriterionStatusBadge = (status: string) => {
    switch (status) {
      case 'SATISFIED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Satisfied
          </span>
        );
      case 'PARTIALLY_SATISFIED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Partially Satisfied
          </span>
        );
      case 'NOT_SATISFIED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            Not Satisfied
          </span>
        );
      case 'INSUFFICIENT_EVIDENCE':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Insufficient Evidence
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-subtle space-y-5">
      {/* Header with AI Model & Advisory Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-700">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              AI Deliverable Acceptance Audit
              <span className="text-[10px] font-mono uppercase bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                {modelName}
              </span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Evaluated {new Date(timestamp).toLocaleString()}
            </span>
          </div>
        </div>

        <div>{getRecommendationBadge(audit.recommendation)}</div>
      </div>

      {/* Score & Executive Summary Block */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
        {/* Score Pillar */}
        <div className="text-center md:text-left md:border-r border-slate-200 md:pr-4 flex flex-col justify-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Compliance Score
          </span>
          <div className="mt-1 flex items-baseline justify-center md:justify-start gap-1">
            <span
              className={`text-3xl font-extrabold tracking-tight ${
                score >= 80
                  ? 'text-emerald-700'
                  : score >= 50
                  ? 'text-amber-700'
                  : 'text-rose-700'
              }`}
            >
              {score}
            </span>
            <span className="text-xs text-slate-400 font-semibold">/ 100</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">
            Computed by the server from per-criterion verdicts
          </span>
          {typeof audit.evidenceCoveragePercent === 'number' && (
            <span
              className="text-[10px] text-slate-500 mt-1"
              title="Share of criteria the submitted evidence made checkable. It is not a probability that the verdicts are correct."
            >
              Evidence coverage: {audit.evidenceCoveragePercent}%
            </span>
          )}
        </div>

        {/* Executive Summary */}
        <div className="md:col-span-3 flex flex-col justify-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Auditor Executive Summary
          </span>
          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
            {audit.summary}
          </p>
          {audit.recommendationReasons && audit.recommendationReasons.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              <strong className="text-slate-600">Why this recommendation:</strong>{' '}
              {audit.recommendationReasons.join(' ')}
            </p>
          )}
        </div>
      </div>

      {/* Criterion-by-Criterion Results Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Criteria Verification Breakdown ({audit.criteriaResults.length})
          </h4>
          <span className="text-[11px] text-slate-400">
            Evaluated independently
          </span>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden bg-white">
          {audit.criteriaResults.map((item, idx) => (
            <div key={idx} className="p-3.5 space-y-2 hover:bg-slate-50/50 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                    {item.criterionId}
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    Criterion #{idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    {item.score}%
                  </span>
                  {getCriterionStatusBadge(item.status)}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-800">Findings:</strong> {item.reasoning}
              </p>

              {item.evidenceReference && (
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200/60 font-mono">
                  <span className="font-semibold text-slate-700 font-sans">
                    Cited Evidence:
                  </span>{' '}
                  {item.evidenceReference}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Missing Requirements & Risks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Missing Requirements */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Missing Requirements & Attention Areas ({audit.missingRequirements.length})
          </div>
          {audit.missingRequirements.length === 0 ? (
            <p className="text-[11px] text-emerald-800">
              ✓ No missing requirements detected based on accessible evidence.
            </p>
          ) : (
            <ul className="space-y-1 text-amber-800 text-[11px]">
              {audit.missingRequirements.map((req, rIdx) => (
                <li key={rIdx} className="flex items-start gap-1.5">
                  <span className="text-amber-500">•</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Identified Risks */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-600" />
            Identified Risks & Caveats ({audit.risks.length})
          </div>
          {audit.risks.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              No technical or delivery risks identified in this submission.
            </p>
          ) : (
            <ul className="space-y-1 text-slate-600 text-[11px]">
              {audit.risks.map((risk, riskIdx) => (
                <li key={riskIdx} className="flex items-start gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Clear Evidence Limitations */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-xs">
        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          Evidence Limitations & Accessibility Boundaries
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Google Gemini evaluated ONLY the evidence text directly accessible to the application. ProofPay does not claim to have executed external code or accessed private GitHub repos without provided snippets:
        </p>
        <ul className="space-y-0.5 text-[11px] text-slate-600 pt-1">
          {audit.evidenceLimitations.map((lim, lIdx) => (
            <li key={lIdx} className="flex items-start gap-1.5">
              <span className="text-slate-400">•</span>
              <span>{lim}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mandatory Non-Automated Payment Disclaimer */}
      <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-[11px] text-indigo-950 flex items-start gap-2 leading-relaxed">
        <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <span>
          <strong>AI Governance Guardrail:</strong> This evaluation is strictly advisory and evidentiary. The AI cannot approve a milestone or release funds, and has no access to payment records. The human client retains final approval authority. PayPal is not integrated yet; payments are simulated.
        </span>
      </div>
    </div>
  );
};
