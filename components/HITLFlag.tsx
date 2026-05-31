import { AlertTriangle, Info } from "lucide-react";

interface Props {
  reasons: string[];
}

const RESOLUTION_MAP: Record<string, string> = {
  "self": "Provide 2 years of personal and business tax returns to document income stability",
  "DTI": "Pay down existing debt or increase income to bring DTI below the program limit",
  "credit": "Build credit history and resolve any negative items to improve credit score",
  "borderline": "A licensed loan officer can identify compensating factors that may offset borderline metrics",
  "confidence": "Additional documentation (bank statements, employment verification) can increase assessment confidence",
};

function getResolution(reason: string): string {
  for (const [key, res] of Object.entries(RESOLUTION_MAP)) {
    if (reason.toLowerCase().includes(key.toLowerCase())) return res;
  }
  return "Consult a licensed mortgage professional to review this factor in detail";
}

export default function HITLFlag({ reasons }: Props) {
  if (reasons.length === 0) return null;

  return (
    <div className="border border-yellow-700 bg-yellow-900/20 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-yellow-300">Human Review Recommended</h3>
          <p className="text-sm text-yellow-200/70 mt-0.5">
            This assessment has uncertainty factors that benefit from professional review before making lending decisions.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {reasons.map((reason, i) => (
          <div key={i} className="bg-yellow-900/20 rounded p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-yellow-200">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
            <div className="text-xs text-yellow-200/60 pl-6">
              Resolution: {getResolution(reason)}
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-yellow-200/50 border-t border-yellow-800/50 pt-3">
        Recommended next steps: Contact a HUD-approved housing counselor or licensed loan officer
        to review your complete financial picture and identify the strongest loan program for your situation.
      </div>
    </div>
  );
}
