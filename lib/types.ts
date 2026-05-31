export type CreditScoreBand = "excellent" | "good" | "fair" | "poor";
export type FactorStatus = "pass" | "fail" | "borderline";
export type EmploymentType = "W2" | "self_employed" | "retired" | "other";
export type LoanType = "conventional" | "fha" | "va";

export interface MortgageProfile {
  grossMonthlyIncome: number;
  monthlyDebts: number;
  homePrice: number;
  downPayment: number;
  creditScoreRange: CreditScoreBand;
  employmentType: EmploymentType;
  loanTerm: 15 | 30;
  loanType: LoanType;
}

export interface CalculatorResult {
  loanAmount: number;
  ltv: number;
  frontEndDTI: number;
  backEndDTI: number;
  estimatedMonthlyPayment: number;
  pmiRequired: boolean;
  pmiMonthlyEstimate: number;
  totalMonthlyPayment: number;
  conformingLimitCheck: "conforming" | "jumbo";
  conformingLimit: number;
}

export interface RegulatoryChunk {
  id: string;
  text: string;
  source: string;
  chunkIndex: number;
  score?: number;
}

export interface VectorChunk extends RegulatoryChunk {
  embedding: number[];
}

export interface QualificationFactor {
  name: string;
  status: FactorStatus;
  confidence: number;
  value: string;
  threshold: string;
  explanation: string;
  citations: string[];
}

export interface QualificationResult {
  factors: QualificationFactor[];
  overall_status: FactorStatus;
  overall_confidence: number;
  hitl_required: boolean;
  hitl_reasons: string[];
  loan_programs: string[];
  qm_determination: "QM" | "non-QM" | "borderline";
  fair_lending_flags: string[];
  regulatory_citations: string[];
}

export interface GuardrailResult {
  pass: boolean;
  reason: string;
  flagged_category: string | null;
}

export interface TraceEntry {
  id: string;
  timestamp: string;
  stage: "guardrails" | "calculate" | "retrieve" | "qualify" | "chat" | "evals";
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  promptVersion: string;
  confidence: number | null;
  passFail: "pass" | "fail" | "na";
  metadata?: Record<string, unknown>;
}

export interface EvalProfile {
  id: string;
  description: string;
  category: "qualified" | "not_qualified" | "borderline";
  expectedStatus: FactorStatus;
  profile: MortgageProfile;
}

export interface EvalResult {
  id: string;
  description: string;
  category: string;
  expectedStatus: FactorStatus;
  actualStatus: FactorStatus;
  overall_confidence: number;
  judgeScore: number;
  judgeRationale: string;
  match: boolean;
}
