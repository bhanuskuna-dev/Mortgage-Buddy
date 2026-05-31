"use client";

import { useState, useEffect } from "react";
import { Trash2, RefreshCw } from "lucide-react";
import { getTraces, clearTraces, getSessionStats } from "@/lib/observability";
import type { TraceEntry } from "@/lib/types";

const STAGE_COLORS: Record<string, string> = {
  guardrails: "text-purple-400",
  calculate: "text-blue-400",
  retrieve: "text-cyan-400",
  qualify: "text-green-400",
  chat: "text-yellow-400",
  evals: "text-orange-400",
};

export default function ObservabilityDashboard() {
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [stats, setStats] = useState(getSessionStats());

  const refresh = () => {
    setTraces(getTraces());
    setStats(getSessionStats());
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  const handleClear = () => {
    clearTraces();
    refresh();
  };

  const p50 = (stage: string) => {
    const stageLats = traces.filter((t) => t.stage === stage).map((t) => t.latencyMs).sort((a, b) => a - b);
    if (stageLats.length === 0) return "—";
    return `${stageLats[Math.floor(stageLats.length * 0.5)]}ms`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Observability Dashboard</h2>
        <div className="flex gap-2">
          <button onClick={refresh} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800 px-2 py-1.5 rounded transition-colors">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button onClick={handleClear} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-slate-800 px-2 py-1.5 rounded transition-colors">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-800/50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">{stats.totalCalls}</div>
          <div className="text-xs text-slate-500">Total API Calls</div>
        </div>
        <div className="bg-slate-800/50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">${stats.totalCost.toFixed(4)}</div>
          <div className="text-xs text-slate-500">Session Cost</div>
        </div>
        <div className="bg-slate-800/50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">{Math.round(stats.avgLatency)}ms</div>
          <div className="text-xs text-slate-500">Avg Latency</div>
        </div>
        <div className="bg-slate-800/50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">
            {traces.filter((t) => t.passFail === "fail").length}
          </div>
          <div className="text-xs text-slate-500">Errors</div>
        </div>
      </div>

      {/* Per-stage breakdown */}
      {Object.keys(stats.byStage).length > 0 && (
        <div className="bg-slate-800/30 rounded p-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">By Stage</h3>
          <div className="grid grid-cols-3 text-xs text-slate-500 font-medium pb-1 border-b border-slate-700">
            <span>Stage</span><span className="text-center">Calls</span><span className="text-right">p50 Latency</span>
          </div>
          {Object.entries(stats.byStage).map(([stage, s]) => (
            <div key={stage} className="grid grid-cols-3 text-sm">
              <span className={STAGE_COLORS[stage] ?? "text-slate-300"}>{stage}</span>
              <span className="text-center text-slate-400">{s.calls}</span>
              <span className="text-right text-slate-400">{p50(stage)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Trace table */}
      {traces.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-3">Time</th>
                <th className="text-left py-2 pr-3">Stage</th>
                <th className="text-left py-2 pr-3">Model</th>
                <th className="text-right py-2 pr-3">In Tokens</th>
                <th className="text-right py-2 pr-3">Out Tokens</th>
                <th className="text-right py-2 pr-3">Cost</th>
                <th className="text-right py-2 pr-3">Latency</th>
                <th className="text-center py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {[...traces].reverse().map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/20">
                  <td className="py-2 pr-3 text-slate-500">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </td>
                  <td className={`py-2 pr-3 font-medium ${STAGE_COLORS[t.stage] ?? "text-slate-300"}`}>{t.stage}</td>
                  <td className="py-2 pr-3 text-slate-400 truncate max-w-[120px]">{t.model ?? "—"}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">{t.inputTokens.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">{t.outputTokens.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">${t.costUsd.toFixed(5)}</td>
                  <td className="py-2 pr-3 text-right text-slate-400">{t.latencyMs}ms</td>
                  <td className="py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      t.passFail === "pass" ? "bg-green-900/40 text-green-400" :
                      t.passFail === "fail" ? "bg-red-900/40 text-red-400" :
                      "bg-slate-700 text-slate-400"
                    }`}>{t.passFail}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-600 text-sm">
          No traces yet — run a qualification or chat to see observability data
        </div>
      )}
    </div>
  );
}
