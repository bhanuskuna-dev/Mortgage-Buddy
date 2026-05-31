"use client";

import { useState } from "react";
import { Play, CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { EvalResult } from "@/lib/types";

interface Summary {
  total: number;
  correct: number;
  accuracy: number;
  avgJudgeScore: number;
  byCategory: Record<string, { total: number; correct: number }>;
}

const STATUS_ICONS = {
  pass: <CheckCircle className="w-4 h-4 text-green-400" />,
  fail: <XCircle className="w-4 h-4 text-red-400" />,
  borderline: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
};

export default function EvalPanel() {
  const [results, setResults] = useState<EvalResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runEvals = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/evals", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
      setSummary(data.summary);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Evaluation Framework</h2>
          <p className="text-xs text-slate-500 mt-0.5">25-profile golden dataset — 10 qualified, 10 not qualified, 5 borderline</p>
        </div>
        <button
          onClick={runEvals}
          disabled={running}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm transition-colors"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Running…" : "Run All Evals"}
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/40 border border-red-800 rounded text-sm text-red-300">{error}</div>}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/50 rounded p-3 text-center">
            <div className="text-2xl font-bold text-white">{summary.accuracy}%</div>
            <div className="text-xs text-slate-500">Overall Accuracy</div>
          </div>
          <div className="bg-slate-800/50 rounded p-3 text-center">
            <div className="text-2xl font-bold text-white">{summary.avgJudgeScore}/10</div>
            <div className="text-xs text-slate-500">Avg Judge Score</div>
          </div>
          <div className="bg-slate-800/50 rounded p-3 text-center">
            <div className="text-2xl font-bold text-green-400">
              {summary.byCategory["qualified"]
                ? `${((summary.byCategory["qualified"].correct / summary.byCategory["qualified"].total) * 100).toFixed(0)}%`
                : "—"}
            </div>
            <div className="text-xs text-slate-500">Qualified Accuracy</div>
          </div>
          <div className="bg-slate-800/50 rounded p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {summary.byCategory["borderline"]
                ? `${((summary.byCategory["borderline"].correct / summary.byCategory["borderline"].total) * 100).toFixed(0)}%`
                : "—"}
            </div>
            <div className="text-xs text-slate-500">Borderline Accuracy</div>
          </div>
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-3">Profile</th>
                <th className="text-center py-2 px-2">Expected</th>
                <th className="text-center py-2 px-2">Actual</th>
                <th className="text-center py-2 px-2">Match</th>
                <th className="text-center py-2 px-2">Conf</th>
                <th className="text-center py-2 px-2">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {results.map((r) => (
                <tr key={r.id} className={`hover:bg-slate-800/30 ${r.match ? "" : "bg-red-900/10"}`}>
                  <td className="py-2 pr-3">
                    <div className="text-white text-xs font-medium">{r.id}</div>
                    <div className="text-slate-500 text-xs truncate max-w-[200px]">{r.description}</div>
                  </td>
                  <td className="py-2 px-2 text-center">{STATUS_ICONS[r.expectedStatus]}</td>
                  <td className="py-2 px-2 text-center">{STATUS_ICONS[r.actualStatus]}</td>
                  <td className="py-2 px-2 text-center">
                    {r.match
                      ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" />
                      : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                  </td>
                  <td className="py-2 px-2 text-center text-slate-400 text-xs">
                    {(r.overall_confidence * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`text-xs font-medium ${r.judgeScore >= 7 ? "text-green-400" : r.judgeScore >= 4 ? "text-yellow-400" : "text-red-400"}`}>
                      {r.judgeScore}/10
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!running && results.length === 0 && (
        <div className="text-center py-12 text-slate-600 text-sm">
          Click "Run All Evals" to test the model against 25 golden profiles
        </div>
      )}
    </div>
  );
}
