import Disclaimer from "@/components/Disclaimer";

const SECTIONS = [
  {
    title: "Overview",
    content: `MortgageReady is an AI-powered mortgage qualification tool built as a portfolio project demonstrating production-grade AI product engineering. It guides borrowers through a multi-stage Ability-to-Repay (ATR) assessment grounded in federal regulatory documents, provides a conversational mortgage coach, and includes a full evaluation framework.`,
  },
  {
    title: "Problem Statement",
    content: `Mortgage qualification is opaque. Borrowers don't know if they qualify until they apply, and lenders have no lightweight tool to give preliminary assessments grounded in actual regulatory standards. Existing calculators are too simple; full pre-approvals require human underwriters. MortgageReady fills the gap as an educational assessment layer between "I wonder if I qualify" and "I'm submitting a full application."`,
  },
  {
    title: "Target Users",
    items: [
      "First-time homebuyers exploring affordability",
      "Repeat buyers sizing up their next purchase",
      "Real estate agents providing preliminary guidance to clients",
      "Loan officers using it as a pre-qualification education tool",
    ],
  },
  {
    title: "5-Stage AI Pipeline",
    items: [
      "Stage 1 — ECOA Guardrails (Haiku): Screens every input for protected characteristics, prompt injection, PII, and off-topic requests before processing",
      "Stage 2 — Financial Calculator (pure math): Deterministic DTI, LTV, PMI, and monthly payment calculations against the 2026 conforming limit ($806,500)",
      "Stage 3 — RAG Pipeline: Lazy ingestion of Fannie Mae Selling Guide, CFPB ATR/QM Rule, and FHA Handbook; TF-IDF vector store with Voyage AI embedding fallback",
      "Stage 4 — Qualification Agent (Sonnet): 8-factor ATR assessment with regulatory citations for income, employment, DTI, LTV, credit, loan program, QM determination, and fair lending",
      "Stage 5 — HITL Checkpoint: Flags borderline cases (confidence < 80%, DTI within 2% of limit, fair credit, self-employed) for human review",
    ],
  },
  {
    title: "Document Upload",
    content: `Borrowers can upload W-2s, tax returns (1040), pay stubs, and bank statements in PDF or image format. Claude Haiku extracts gross income, employer name, employment type, and monthly debts, then auto-populates the qualification form. Documents are processed in-session only and never stored persistently.`,
  },
  {
    title: "Fair Lending Design",
    content: `The ECOA guardrail uses Claude Haiku to reject any input referencing protected characteristics (race, color, religion, sex, national origin, age, marital status, familial status) before it reaches the qualification pipeline. The qualification agent prompt explicitly instructs the model that fair lending compliance is always "pass" — no protected factors are ever considered. This is tested explicitly in the golden dataset.`,
  },
  {
    title: "RAG vs. Fine-Tuning",
    content: `Regulatory content changes frequently (loan limits, DTI thresholds, MIP rates). RAG over source documents ensures the model always reasons from the current authoritative text rather than training-data snapshots. Fine-tuning would bake in stale limits and require retraining on every regulatory update. RAG also provides mandatory source citations, making every claim auditable.`,
  },
  {
    title: "Evaluation Framework",
    items: [
      "25-profile golden dataset: 10 clearly qualified, 10 clearly not qualified, 5 borderline",
      "Targets: ≥90% accuracy on clear cases, ≥80% on borderline, 100% on fair lending guardrail",
      "Claude-as-judge scores each result 0–10 on correctness, reasoning quality, and citation accuracy",
      "Cost optimization: Haiku judges clear cases, Sonnet reserved for borderline profiles",
    ],
  },
  {
    title: "Observability",
    items: [
      "Every API call logged to localStorage: timestamp, stage, model, tokens in/out, cost, latency, prompt version, confidence, pass/fail",
      "Running session cost indicator in nav bar",
      "p50 latency per stage, error rate, confidence distribution",
      "Prompt versioning in lib/prompts.ts enables systematic A/B testing across versions",
    ],
  },
  {
    title: "Cost Optimizations",
    items: [
      "Prompt caching on qualification and chat system prompts (cache hits billed at 10% of input price)",
      "Haiku for guardrails, document parsing, and eval judging on clear cases",
      "3 RAG chunks for chat vs 5 for qualification — reduces tokens per message",
      "In-process query cache (50 entries) eliminates duplicate embedding calls",
      "max_tokens: 1500 cap on qualification output prevents runaway Sonnet responses",
    ],
  },
  {
    title: "Known Limitations",
    items: [
      "RAG store resets on Vercel cold starts — first request re-ingests PDFs or falls back to hardcoded stubs",
      "Income estimates from pay stubs and bank statements are approximations, not verified figures",
      "Credit score is entered as a range, not pulled from a bureau — assessment uses midpoint estimates",
      "No VA eligibility verification — VA loan matching assumes the borrower is eligible",
      "Jumbo loan limits vary by county; only the national conforming limit ($806,500) is used",
    ],
  },
  {
    title: "Production Scaling",
    items: [
      "Replace in-memory TF-IDF store with a persistent vector database (Pinecone, pgvector) to survive cold starts",
      "Pre-ingest regulatory PDFs at build time and ship embeddings as a static asset",
      "Add a real credit score range via soft-pull integration (Experian, Equifax API)",
      "Rate limiting and auth layer before the qualify endpoint",
      "Audit log of all qualification runs (anonymized) for model performance monitoring",
      "Webhook to notify a loan officer when HITL is triggered",
    ],
  },
  {
    title: "Privacy & Data Handling",
    items: [
      "No user financial data stored persistently — session only",
      "Uploaded documents processed in-memory and discarded after extraction",
      "No SSN, full DOB, or account numbers accepted (guardrail + extraction prompt explicitly exclude them)",
      "All AI calls go through Anthropic's API under standard data processing terms",
    ],
  },
];

export default function PRDPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-2 pb-8">
      <div className="bg-[var(--navy-900)] rounded-lg p-6 border border-slate-800">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">MortgageReady — Product Requirements</h1>
          <p className="text-sm text-slate-500 mt-1">Product brief · Architecture decisions · Known limitations</p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-base font-semibold text-blue-400 mb-2">{section.title}</h2>
              {"content" in section && (
                <p className="text-sm text-slate-300 leading-relaxed">{section.content}</p>
              )}
              {"items" in section && section.items && (
                <ul className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-blue-500 mt-1 shrink-0">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
