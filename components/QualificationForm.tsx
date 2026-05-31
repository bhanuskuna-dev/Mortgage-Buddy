"use client";

import { useState } from "react";
import { Shield, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import type { MortgageProfile, QualificationResult, CalculatorResult, GuardrailResult } from "@/lib/types";
import { logTrace, computeCost } from "@/lib/observability";

interface Props {
  onResult: (data: {
    qualification: QualificationResult;
    calculator: CalculatorResult;
    sources: { index: number; source: string; excerpt: string }[];
  }) => void;
  onLoading: (loading: boolean) => void;
}

const CREDIT_OPTIONS = [
  { value: "excellent", label: "Excellent (750+)" },
  { value: "good", label: "Good (700–749)" },
  { value: "fair", label: "Fair (650–699)" },
  { value: "poor", label: "Poor (<650)" },
];

export default function QualificationForm({ onResult, onLoading }: Props) {
  const [profile, setProfile] = useState<MortgageProfile>({
    grossMonthlyIncome: 8000,
    monthlyDebts: 400,
    homePrice: 350000,
    downPayment: 35000,
    creditScoreRange: "good",
    employmentType: "W2",
    loanTerm: 30,
    loanType: "conventional",
  });
  const [loading, setLoading] = useState(false);
  const [guardResult, setGuardResult] = useState<GuardrailResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof MortgageProfile, value: unknown) =>
    setProfile((p) => ({ ...p, [key]: value }));

  const downPct = profile.homePrice > 0
    ? ((profile.downPayment / profile.homePrice) * 100).toFixed(1)
    : "0.0";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    onLoading(true);
    setError(null);
    setGuardResult(null);

    const start = performance.now();
    try {
      const res = await fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      const data = await res.json();
      const latencyMs = Math.round(performance.now() - start);

      const inputTokens = parseInt(res.headers.get("X-Tokens-Input") ?? "0");
      const outputTokens = parseInt(res.headers.get("X-Tokens-Output") ?? "0");
      const model = res.headers.get("X-Model") ?? "claude-sonnet-4-6";
      const promptVersion = res.headers.get("X-Prompt-Version") ?? "v1";
      const confidence = parseFloat(res.headers.get("X-Confidence") ?? "0");

      if (data.blocked) {
        setGuardResult({ pass: false, reason: data.reason, flagged_category: "blocked" });
        logTrace({ stage: "guardrails", model: "claude-haiku-4-5-20251001", inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs, promptVersion: "v1", confidence: null, passFail: "fail" });
        return;
      }

      setGuardResult({ pass: true, reason: "", flagged_category: null });
      logTrace({
        stage: "qualify",
        model,
        inputTokens,
        outputTokens,
        costUsd: computeCost(model, inputTokens, outputTokens),
        latencyMs,
        promptVersion,
        confidence,
        passFail: data.qualification?.overall_status === "fail" ? "fail" : "pass",
      });

      onResult(data);
    } catch (err) {
      setError("Request failed. Please check your connection and try again.");
      console.error(err);
    } finally {
      setLoading(false);
      onLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-white">Borrower Profile</h2>

      {/* Guardrail indicator */}
      {guardResult && (
        <div className={`flex items-start gap-2 p-3 rounded text-sm ${guardResult.pass ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
          {guardResult.pass ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <ShieldX className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{guardResult.pass ? "Guardrails passed — no compliance issues detected" : guardResult.reason}</span>
        </div>
      )}
      {!guardResult && !loading && (
        <div className="flex items-center gap-2 p-3 rounded text-sm bg-slate-800/50 text-slate-500">
          <Shield className="w-4 h-4" />
          <span>ECOA guardrails active</span>
        </div>
      )}

      {error && <div className="p-3 rounded bg-red-900/40 text-red-300 text-sm">{error}</div>}

      {/* Financials */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Gross Monthly Income</span>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={profile.grossMonthlyIncome}
              onChange={(e) => set("grossMonthlyIncome", Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 pl-6 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              min={0}
              required
            />
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Monthly Debts</span>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={profile.monthlyDebts}
              onChange={(e) => set("monthlyDebts", Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 pl-6 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              min={0}
            />
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Home Price</span>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={profile.homePrice}
              onChange={(e) => set("homePrice", Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 pl-6 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              min={1}
              required
            />
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Down Payment <span className="text-blue-400">({downPct}%)</span></span>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={profile.downPayment}
              onChange={(e) => set("downPayment", Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 pl-6 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              min={0}
            />
          </div>
        </label>
      </div>

      {/* Credit score */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Credit Score Range</span>
        <select
          value={profile.creditScoreRange}
          onChange={(e) => set("creditScoreRange", e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          {CREDIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      {/* Employment type */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Employment Type</span>
        <select
          value={profile.employmentType}
          onChange={(e) => set("employmentType", e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="W2">W-2 Employee</option>
          <option value="self_employed">Self-Employed</option>
          <option value="retired">Retired</option>
          <option value="other">Other</option>
        </select>
      </label>

      {/* Loan type and term toggles */}
      <div className="space-y-2">
        <span className="text-xs text-slate-400">Loan Type</span>
        <div className="flex gap-2">
          {(["conventional", "fha", "va"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("loanType", t)}
              className={`px-3 py-1.5 rounded text-sm capitalize transition-colors ${
                profile.loanType === t
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {t === "fha" ? "FHA" : t === "va" ? "VA" : "Conventional"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-slate-400">Loan Term</span>
        <div className="flex gap-2">
          {([15, 30] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("loanTerm", t)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                profile.loanTerm === t
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {t}-Year
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded font-medium transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          "Assess Qualification"
        )}
      </button>
    </form>
  );
}
