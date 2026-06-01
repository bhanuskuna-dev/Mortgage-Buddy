"use client";

import { useState, useEffect } from "react";
import QualificationForm from "@/components/QualificationForm";
import QualificationResultPanel from "@/components/QualificationResult";
import HITLFlag from "@/components/HITLFlag";
import DocumentUpload from "@/components/DocumentUpload";
import Disclaimer from "@/components/Disclaimer";
import { Loader2 } from "lucide-react";
import type { QualificationResult, CalculatorResult, MortgageProfile } from "@/lib/types";

interface ResultData {
  qualification: QualificationResult;
  calculator: CalculatorResult;
  sources: { index: number; source: string; excerpt: string }[];
}

export default function QualifyPage() {
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ragReady, setRagReady] = useState(false);
  const [appliedFields, setAppliedFields] = useState<Partial<MortgageProfile>>({});

  // Warm up the RAG store on page load
  useEffect(() => {
    fetch("/api/retrieve?warmup=1")
      .then((r) => r.json())
      .then((d) => { if (d.ingested) setRagReady(true); })
      .catch(() => {});

    const interval = setInterval(() => {
      fetch("/api/retrieve")
        .then((r) => r.json())
        .then((d) => {
          if (d.ingested) { setRagReady(true); clearInterval(interval); }
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      {/* RAG status banner */}
      {!ragReady && (
        <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-900/20 border border-blue-800 rounded px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading regulatory knowledge base (first request only)…
        </div>
      )}
      {ragReady && (
        <div className="text-xs text-green-500 bg-green-900/10 border border-green-900 rounded px-3 py-1.5">
          Regulatory knowledge base ready
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: upload + form */}
        <div className="space-y-4">
          {/* Document upload */}
          <div className="bg-[var(--navy-900)] rounded-lg p-5 border border-slate-800">
            <DocumentUpload onApply={(fields) => setAppliedFields(fields)} />
          </div>

          {/* Qualification form */}
          <div className="bg-[var(--navy-900)] rounded-lg p-5 border border-slate-800">
            <QualificationForm
              onResult={setResult}
              onLoading={setLoading}
              appliedFields={appliedFields}
            />
          </div>
        </div>

        {/* Right column: result */}
        <div className="space-y-4">
          {loading && (
            <div className="bg-[var(--navy-900)] rounded-lg p-8 border border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <div className="text-sm">Running ATR assessment…</div>
              <div className="text-xs text-slate-600">Retrieving regulatory context and analyzing 8 factors</div>
            </div>
          )}

          {!loading && result && (
            <>
              <div className="bg-[var(--navy-900)] rounded-lg p-5 border border-slate-800">
                <QualificationResultPanel
                  qualification={result.qualification}
                  calculator={result.calculator}
                  sources={result.sources}
                />
              </div>
              {result.qualification.hitl_required && (
                <HITLFlag reasons={result.qualification.hitl_reasons ?? []} />
              )}
            </>
          )}

          {!loading && !result && (
            <div className="bg-[var(--navy-900)] rounded-lg p-8 border border-slate-800 flex items-center justify-center text-slate-600 text-sm">
              Upload documents or fill out the form to see your qualification assessment
            </div>
          )}
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
