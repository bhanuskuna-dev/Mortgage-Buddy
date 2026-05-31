import Anthropic from "@anthropic-ai/sdk";
import { calculateMortgage, checkRegulatory, CREDIT_SCORE_MIDPOINT } from "@/lib/calculator";
import { ensureIngested } from "@/lib/regulatoryChecks";
import { regulatoryStore } from "@/lib/vectorStore";
import { QUALIFICATION_PROMPT_V1, GUARDRAILS_PROMPT_V1, PROMPT_VERSIONS } from "@/lib/prompts";
import type { MortgageProfile, QualificationResult, GuardrailResult } from "@/lib/types";

const client = new Anthropic();

function buildProfileQuery(profile: MortgageProfile, dti: number, ltv: number): string {
  return `mortgage qualification ${profile.loanType} loan DTI ${dti.toFixed(1)}% LTV ${ltv.toFixed(1)}% credit ${profile.creditScoreRange} employment ${profile.employmentType} ATR QM ability to repay qualified mortgage conforming limit PMI requirements`;
}

function shouldTriggerHITL(result: QualificationResult, profile: MortgageProfile, backDTI: number): boolean {
  if (result.overall_confidence < 0.80) return true;
  if (result.factors.some((f) => f.status === "borderline")) return true;
  if (backDTI >= 41 && backDTI <= 43) return true;
  if (profile.creditScoreRange === "fair") return true;
  if (profile.employmentType === "self_employed") return true;
  return false;
}

async function runGuardrails(query: string): Promise<GuardrailResult> {
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: GUARDRAILS_PROMPT_V1,
      messages: [{ role: "user", content: query }],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : raw);
  } catch {
    return { pass: true, reason: "", flagged_category: null };
  }
}

export async function POST(req: Request): Promise<Response> {
  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const profile: MortgageProfile = await req.json();

    // Stage 1: Guardrails
    const guardQuery = `Mortgage qualification request for ${profile.loanType} loan, ${profile.employmentType} borrower, ${profile.creditScoreRange} credit, home price $${profile.homePrice}`;
    const guard = await runGuardrails(guardQuery);
    if (!guard.pass) {
      return Response.json({ blocked: true, reason: guard.reason });
    }

    // Stage 2: Calculator
    const calculator = calculateMortgage(profile);

    // Stage 3: RAG retrieval
    await ensureIngested();
    const profileQuery = buildProfileQuery(profile, calculator.backEndDTI, calculator.ltv);
    const chunks = await regulatoryStore.query(profileQuery, 5);

    const ragContext = chunks
      .map((c, i) => `[Source ${i + 1}] ${c.source}:\n${c.text}`)
      .join("\n\n");

    // Stage 4: Qualification agent (Sonnet) with prompt caching
    const userContent = `BORROWER PROFILE:
- Gross Monthly Income: $${profile.grossMonthlyIncome.toLocaleString()}
- Monthly Debts: $${profile.monthlyDebts.toLocaleString()}
- Home Price: $${profile.homePrice.toLocaleString()}
- Down Payment: $${profile.downPayment.toLocaleString()} (${((profile.downPayment / profile.homePrice) * 100).toFixed(1)}%)
- Credit Score Range: ${profile.creditScoreRange} (~${CREDIT_SCORE_MIDPOINT[profile.creditScoreRange]} FICO)
- Employment Type: ${profile.employmentType}
- Loan Type: ${profile.loanType}
- Loan Term: ${profile.loanTerm} years

CALCULATOR RESULTS:
- Loan Amount: $${calculator.loanAmount.toLocaleString()}
- LTV: ${calculator.ltv}%
- Front-End DTI: ${calculator.frontEndDTI}%
- Back-End DTI: ${calculator.backEndDTI}%
- Estimated Monthly Payment (P+I): $${calculator.estimatedMonthlyPayment.toLocaleString()}
- PMI Required: ${calculator.pmiRequired} (est. $${calculator.pmiMonthlyEstimate}/mo)
- Total Monthly Payment: $${calculator.totalMonthlyPayment.toLocaleString()}
- Conforming Status: ${calculator.conformingLimitCheck} (limit: $${calculator.conformingLimit.toLocaleString()})

REGULATORY CONTEXT:
${ragContext}

Perform the 8-factor ATR assessment and return the JSON qualification result.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: QUALIFICATION_PROMPT_V1,
      messages: [{ role: "user", content: userContent }],
    });

    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const qualification: QualificationResult = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

    // Stage 5: HITL check
    qualification.hitl_required = shouldTriggerHITL(qualification, profile, calculator.backEndDTI);

    const latencyMs = Date.now() - start;
    return Response.json(
      {
        blocked: false,
        calculator,
        qualification,
        sources: chunks.map((c, i) => ({ index: i + 1, source: c.source, excerpt: c.text.slice(0, 200) })),
      },
      {
        headers: {
          "X-Tokens-Input": String(inputTokens),
          "X-Tokens-Output": String(outputTokens),
          "X-Model": "claude-sonnet-4-6",
          "X-Prompt-Version": PROMPT_VERSIONS.QUALIFICATION,
          "X-Latency-Ms": String(latencyMs),
          "X-Confidence": String(qualification.overall_confidence),
        },
      }
    );
  } catch (err) {
    console.error("[qualify] error:", err);
    return Response.json({ error: "Qualification failed", blocked: false }, { status: 500 });
  }
}
