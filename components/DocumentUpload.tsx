"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { ParsedDocumentData } from "@/app/api/parse-document/route";
import type { MortgageProfile } from "@/lib/types";
import { logTrace, computeCost } from "@/lib/observability";

interface UploadedDoc {
  filename: string;
  data: ParsedDocumentData;
}

interface Props {
  onApply: (fields: Partial<MortgageProfile>) => void;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  w2: "W-2",
  tax_return_1040: "Tax Return (1040)",
  pay_stub: "Pay Stub",
  bank_statement: "Bank Statement",
  other: "Document",
};

const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.webp";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-green-400 bg-green-900/30" : pct >= 50 ? "text-yellow-400 bg-yellow-900/30" : "text-red-400 bg-red-900/30";
  return <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>{pct}% confidence</span>;
}

function DocCard({ doc, onRemove, onApply }: { doc: UploadedDoc; onRemove: () => void; onApply: (d: ParsedDocumentData) => void }) {
  const [expanded, setExpanded] = useState(true);
  const { data } = doc;

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/60">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-left flex-1 min-w-0">
          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm text-white truncate block">{doc.filename}</span>
            <span className="text-xs text-slate-500">{DOC_TYPE_LABELS[data.document_type] ?? "Document"}</span>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-1" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 ml-1" />}
        </button>
        <div className="flex items-center gap-2 ml-2">
          <ConfidenceBadge value={data.confidence} />
          <button onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-3 space-y-3">
          {/* Extracted fields */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {data.gross_monthly_income != null && (
              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-xs text-slate-500 mb-0.5">Monthly Income</div>
                <div className="text-white font-medium">${data.gross_monthly_income.toLocaleString()}</div>
              </div>
            )}
            {data.gross_annual_income != null && (
              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-xs text-slate-500 mb-0.5">Annual Income</div>
                <div className="text-white font-medium">${data.gross_annual_income.toLocaleString()}</div>
              </div>
            )}
            {data.employer_name && (
              <div className="bg-slate-900/50 rounded p-2 col-span-2">
                <div className="text-xs text-slate-500 mb-0.5">Employer</div>
                <div className="text-white font-medium truncate">{data.employer_name}</div>
              </div>
            )}
            {data.employment_type && (
              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-xs text-slate-500 mb-0.5">Employment</div>
                <div className="text-white font-medium">{data.employment_type}</div>
              </div>
            )}
            {data.tax_year && (
              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-xs text-slate-500 mb-0.5">Tax Year</div>
                <div className="text-white font-medium">{data.tax_year}</div>
              </div>
            )}
            {data.monthly_debts != null && (
              <div className="bg-slate-900/50 rounded p-2">
                <div className="text-xs text-slate-500 mb-0.5">Monthly Debts</div>
                <div className="text-white font-medium">${data.monthly_debts.toLocaleString()}</div>
              </div>
            )}
          </div>

          {data.notes && (
            <p className="text-xs text-slate-500 italic">{data.notes}</p>
          )}

          {data.fields_found.length > 0 && (
            <button
              onClick={() => onApply(data)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-1.5 rounded transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Apply to Form
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentUpload({ onApply }: Props) {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, 5); // max 5 at once
    if (fileArray.length === 0) return;

    setUploading(true);
    setError(null);

    for (const file of fileArray) {
      const start = performance.now();
      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/parse-document", { method: "POST", body: form });
        const json = await res.json();

        if (!res.ok || json.error) {
          setError(json.error ?? "Upload failed");
          continue;
        }

        const latencyMs = Math.round(performance.now() - start);
        const inputTokens = parseInt(res.headers.get("X-Tokens-Input") ?? "0");
        const outputTokens = parseInt(res.headers.get("X-Tokens-Output") ?? "0");

        logTrace({
          stage: "guardrails", // reuse closest stage type; observability records the call
          model: "claude-haiku-4-5-20251001",
          inputTokens,
          outputTokens,
          costUsd: computeCost("claude-haiku-4-5-20251001", inputTokens, outputTokens),
          latencyMs,
          promptVersion: "v1",
          confidence: json.data?.confidence ?? null,
          passFail: "pass",
          metadata: { stage_label: "document_parse", filename: file.name },
        });

        setDocs((prev) => [...prev, { filename: json.filename, data: json.data }]);
      } catch {
        setError(`Failed to process ${file.name}`);
      }
    }

    setUploading(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleApply = (data: ParsedDocumentData) => {
    const fields: Partial<MortgageProfile> = {};
    if (data.gross_monthly_income) fields.grossMonthlyIncome = data.gross_monthly_income;
    if (data.employment_type) fields.employmentType = data.employment_type;
    if (data.monthly_debts != null) fields.monthlyDebts = data.monthly_debts;
    onApply(fields);
  };

  const handleApplyAll = () => {
    // Merge all docs — last one wins for conflicts
    const merged: Partial<MortgageProfile> = {};
    for (const doc of docs) {
      const d = doc.data;
      if (d.gross_monthly_income) merged.grossMonthlyIncome = d.gross_monthly_income;
      if (d.employment_type) merged.employmentType = d.employment_type;
      if (d.monthly_debts != null) merged.monthlyDebts = d.monthly_debts;
    }
    onApply(merged);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Upload Documents</h3>
        <span className="text-xs text-slate-600">W-2 · Tax Return · Pay Stub · Bank Statement</span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-900/20"
            : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-blue-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs">Extracting data…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-500">
            <Upload className="w-6 h-6" />
            <span className="text-xs">Drop files or click to upload</span>
            <span className="text-xs text-slate-600">PDF, JPG, PNG — up to 10MB each</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded p-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Uploaded docs */}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc, i) => (
            <DocCard
              key={i}
              doc={doc}
              onRemove={() => setDocs((prev) => prev.filter((_, j) => j !== i))}
              onApply={handleApply}
            />
          ))}

          {docs.length > 1 && (
            <button
              onClick={handleApplyAll}
              className="w-full text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded py-1.5 transition-colors"
            >
              Apply All Documents to Form
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Documents are processed in-session only and never stored.
      </p>
    </div>
  );
}
