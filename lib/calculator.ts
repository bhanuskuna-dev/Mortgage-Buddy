import type { MortgageProfile, CalculatorResult, FactorStatus, CreditScoreBand, LoanType } from "./types";

export const CONFORMING_LIMIT = 806_500;

const RATE_BY_CREDIT: Record<CreditScoreBand, number> = {
  excellent: 0.065,
  good: 0.070,
  fair: 0.075,
  poor: 0.085,
};

const CREDIT_SCORE_MIN: Record<LoanType, number> = {
  conventional: 620,
  fha: 580,
  va: 620,
};

// Approximate numeric midpoints for credit score bands (for threshold comparisons)
export const CREDIT_SCORE_MIDPOINT: Record<CreditScoreBand, number> = {
  excellent: 775,
  good: 725,
  fair: 665,
  poor: 580,
};

function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

export function calculateMortgage(profile: MortgageProfile): CalculatorResult {
  const loanAmount = profile.homePrice - profile.downPayment;
  const ltv = loanAmount / profile.homePrice;
  const rate = RATE_BY_CREDIT[profile.creditScoreRange];
  const termMonths = profile.loanTerm * 12;

  const estimatedMonthlyPayment = monthlyPayment(loanAmount, rate, termMonths);

  const frontEndDTI = estimatedMonthlyPayment / profile.grossMonthlyIncome;
  const backEndDTI = (estimatedMonthlyPayment + profile.monthlyDebts) / profile.grossMonthlyIncome;

  // PMI for conventional if LTV > 80%; FHA always has MIP
  const pmiRequired = profile.loanType === "conventional"
    ? ltv > 0.80
    : profile.loanType === "fha";

  // Conventional PMI ~0.8% annually; FHA MIP ~0.55% annually
  const pmiRate = profile.loanType === "fha" ? 0.0055 : 0.008;
  const pmiMonthlyEstimate = pmiRequired ? (loanAmount * pmiRate) / 12 : 0;
  const totalMonthlyPayment = estimatedMonthlyPayment + pmiMonthlyEstimate;

  const conformingLimitCheck = loanAmount > CONFORMING_LIMIT ? "jumbo" : "conforming";

  return {
    loanAmount,
    ltv: parseFloat((ltv * 100).toFixed(2)),
    frontEndDTI: parseFloat((frontEndDTI * 100).toFixed(2)),
    backEndDTI: parseFloat((backEndDTI * 100).toFixed(2)),
    estimatedMonthlyPayment: parseFloat(estimatedMonthlyPayment.toFixed(2)),
    pmiRequired,
    pmiMonthlyEstimate: parseFloat(pmiMonthlyEstimate.toFixed(2)),
    totalMonthlyPayment: parseFloat(totalMonthlyPayment.toFixed(2)),
    conformingLimitCheck,
    conformingLimit: CONFORMING_LIMIT,
  };
}

export function checkRegulatory(result: CalculatorResult, profile: MortgageProfile): {
  dtiStatus: FactorStatus;
  ltvStatus: FactorStatus;
  creditStatus: FactorStatus;
  downPaymentStatus: FactorStatus;
} {
  const backDTI = result.backEndDTI;
  let dtiStatus: FactorStatus;
  if (profile.loanType === "fha") {
    dtiStatus = backDTI <= 43 ? "pass" : backDTI <= 50 ? "borderline" : "fail";
  } else {
    dtiStatus = backDTI <= 41 ? "pass" : backDTI <= 43 ? "borderline" : "fail";
  }

  const ltv = result.ltv;
  let ltvStatus: FactorStatus;
  if (profile.loanType === "va") {
    ltvStatus = ltv <= 100 ? "pass" : "fail";
  } else if (profile.loanType === "fha") {
    ltvStatus = ltv <= 96.5 ? "pass" : ltv <= 100 ? "borderline" : "fail";
  } else {
    ltvStatus = ltv <= 80 ? "pass" : ltv <= 97 ? "borderline" : "fail";
  }

  const scoreMin = CREDIT_SCORE_MIN[profile.loanType];
  const scoreMid = CREDIT_SCORE_MIDPOINT[profile.creditScoreRange];
  let creditStatus: FactorStatus;
  if (scoreMid >= scoreMin + 20) {
    creditStatus = "pass";
  } else if (scoreMid >= scoreMin) {
    creditStatus = "borderline";
  } else {
    creditStatus = "fail";
  }

  const downPct = (profile.downPayment / profile.homePrice) * 100;
  let downPaymentStatus: FactorStatus;
  if (profile.loanType === "fha") {
    downPaymentStatus = downPct >= 3.5 ? "pass" : downPct >= 10 ? "borderline" : "fail";
  } else if (profile.loanType === "va") {
    downPaymentStatus = "pass"; // VA allows 0% down
  } else {
    downPaymentStatus = downPct >= 20 ? "pass" : downPct >= 3 ? "borderline" : "fail";
  }

  return { dtiStatus, ltvStatus, creditStatus, downPaymentStatus };
}
