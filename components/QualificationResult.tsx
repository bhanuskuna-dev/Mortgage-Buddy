"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type { QualificationResult, CalculatorResult } from "@/lib/types";

interface Props {
  qualification: QualificationResult;
  calculator: CalculatorResult;
  sources: { index: number; source: string; excerpt: string }[];
}

const STATUS_CONFIG = {
  pass: { label: "PASS", color: "text-green-400", bg: "bg-green-900/30 border-green-800", icon: CheckCircle },
  fail: { label: "FAIL", color: "text-red-400", bg: "bg-red-900/30 border-red-800", icon: XCircle },
  borderline: { label: "BORDERLINE", color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-800", icon: AlertTriangle },
};

const OVERALL_LABEL = {
  pass: "LIKELY QUALIFIED",
  fail: "LIKELY NOT QUALIFIED",
  borderline: "BORDERLINE",
};

function FactorRow({ factor }: { factor: QualificationResult["factors"][0] }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[factor.status];
  const Icon = cfg.icon;

  return (
    <div className={`border rounded p-3 ${cfg.bg}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${cfg.color}`} />
          <span className="text-sm font-medium text-white">{factor.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          <span className="text-xs text-slate-500">{(factor.confidence * 100).toFixed(0)}% conf</span>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex gap-4 text-slate-400">
            <span>Value: <span className="text-white">{factor.value}</span></span>
            <span>Threshold: <span className="text-white">{factor.threshold}</span></span>
          </div>
          <p className="text-slate-300">{factor.explanation}</p>
          {factor.citations?.length > 0 && (
            <div className="text-xs text-slate-500">
              Citations: {factor.citations.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QualificationResultPanel({ qualification, calculator, sources }: Props) {
  const [showSources, setShowSources] = useState(false);
  const cfg = STATUS_CONFIG[qualification.overall_status];
  const OverallIcon = cfg.icon;

  return (
    <div className="space-y-5">
      {/* Overall verdict */}
      <div className={`border rounded-lg p-5 ${cfg.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <OverallIcon className={`w-8 h-8 ${cfg.color}`} />
            <div>
              <div className={`text-xl font-bold ${cfg.color}`}>
                {OVERALL_LABEL[qualification.overall_status]}
              </div>
              <div className="text-sm text-slate-400">
                {(qualification.overall_confidence * 100).toFixed(0)}% confidence • {qualification.qm_determination}
              </div>
            </div>
          </div>
        </div>

        {/* Loan programs */}
        {qualification.loan_programs?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {qualification.loan_programs.map((p) => (
              <span key={p} className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full">
                {p.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Calculator summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Back-End DTI", value: `${calculator.backEndDTI}%` },
          { label: "LTV Ratio", value: `${calculator.ltv}%` },
          { label: "Monthly Payment", value: `$${calculator.totalMonthlyPayment.toLocaleString()}` },
          { label: "Loan Amount", value: `$${calculator.loanAmount.toLocaleString()}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-800/50 rounded p-3 text-center">
            <div className="text-lg font-bold text-white">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* 8-factor breakdown */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">ATR Assessment Factors</h3>
        {qualification.factors?.map((f) => <FactorRow key={f.name} factor={f} />)}
      </div>

      {/* Fair lending */}
      <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-900 rounded text-sm text-green-400">
        <CheckCircle className="w-4 h-4 shrink-0" />
        <span>Fair Lending: No ECOA-protected characteristics considered in this assessment</span>
      </div>

      {/* Sources */}
      {sources?.length > 0 && (
        <div className="border border-slate-700 rounded">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full flex items-center justify-between p-3 text-sm text-slate-400 hover:text-white"
          >
            <span>Regulatory Sources ({sources.length})</span>
            {showSources ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showSources && (
            <div className="border-t border-slate-700 divide-y divide-slate-800">
              {sources.map((s) => (
                <div key={s.index} className="p-3">
                  <div className="text-xs font-medium text-blue-400 mb-1">[Source {s.index}] {s.source}</div>
                  <p className="text-xs text-slate-500">{s.excerpt}…</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flags from HITL reasons */}
      {qualification.hitl_reasons && qualification.hitl_reasons.length > 0 && (
        <div className="space-y-1">
          {qualification.hitl_reasons.map((flag, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-yellow-300 bg-yellow-900/20 border border-yellow-900 rounded p-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              {flag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
