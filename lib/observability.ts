"use client";

import type { TraceEntry } from "./types";

const TRACE_KEY = "mortgageready-traces";
const MAX_TRACES = 100;

const COST_PER_M: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "voyage-3": { input: 0.12, output: 0 },
};

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_M[model] ?? { input: 3.0, output: 15.0 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export function logTrace(entry: Omit<TraceEntry, "id" | "timestamp">): void {
  if (typeof window === "undefined") return;
  const traces = getTraces();
  const full: TraceEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const updated = [...traces, full].slice(-MAX_TRACES);
  localStorage.setItem(TRACE_KEY, JSON.stringify(updated));
}

export function getTraces(): TraceEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TRACE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearTraces(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TRACE_KEY);
}

export function getSessionStats() {
  const traces = getTraces();
  const totalCost = traces.reduce((s, t) => s + t.costUsd, 0);
  const totalCalls = traces.length;
  const avgLatency = totalCalls > 0
    ? traces.reduce((s, t) => s + t.latencyMs, 0) / totalCalls
    : 0;

  const byStage: Record<string, { calls: number; cost: number; totalLatency: number }> = {};
  for (const t of traces) {
    if (!byStage[t.stage]) byStage[t.stage] = { calls: 0, cost: 0, totalLatency: 0 };
    byStage[t.stage].calls++;
    byStage[t.stage].cost += t.costUsd;
    byStage[t.stage].totalLatency += t.latencyMs;
  }

  return { totalCost, totalCalls, avgLatency, byStage };
}
