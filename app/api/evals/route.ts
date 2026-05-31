import Anthropic from "@anthropic-ai/sdk";
import { calculateMortgage } from "@/lib/calculator";
import { ensureIngested } from "@/lib/regulatoryChecks";
import { regulatoryStore } from "@/lib/vectorStore";
import { QUALIFICATION_PROMPT_V1, EVAL_JUDGE_PROMPT_V1, PROMPT_VERSIONS } from "@/lib/prompts";
import { CREDIT_SCORE_MIDPOINT } from "@/lib/calculator";
import type { EvalProfile, EvalResult, QualificationResult } from "@/lib/types";
import goldenDataset from "@/data/golden-dataset.json";

const client = new Anthropic();

async function qualifyProfile(profile: EvalProfile["profile"]): Promise<QualificationResult | null> {
  try {
    const calculator = calculateMortgage(profile);
    const chunks = await regulatoryStore.query(
      `${profile.loanType} DTI ${calculator.backEndDTI.toFixed(1)}% credit ${profile.creditScoreRange} ATR QM`,
      5
    );
    const ragContext = chunks.map((c, i) => `[Source ${i + 1}] ${c.source}:\n${c.text}`).join("\n\n");

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
- PMI Required: ${calculator.pmiRequired}
- Conforming Status: ${calculator.conformingLimitCheck}

REGULATORY CONTEXT:
${ragContext}

Perform the 8-factor ATR assessment and return the JSON qualification result.`;

    // Use Haiku for clear cases (qualified/not_qualified), Sonnet only for borderline
    const model = "claude-haiku-4-5-20251001"; // Cost optimization: Haiku for all evals
    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      system: QUALIFICATION_PROMPT_V1,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : raw);
  } catch {
    return null;
  }
}

async function judgeResult(
  expected: string,
  actual: QualificationResult,
  category: string
): Promise<{ score: number; rationale: string }> {
  try {
    // Cost optimization: use Haiku for clear cases
    const model = category === "borderline" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      system: EVAL_JUDGE_PROMPT_V1,
      messages: [
        {
          role: "user",
          content: `Expected status: ${expected}
Actual status: ${actual.overall_status}
Confidence: ${actual.overall_confidence}
Factors: ${actual.factors?.map((f) => `${f.name}: ${f.status}`).join(", ")}
Fair lending flags: ${actual.fair_lending_flags?.join(", ") || "none"}
Loan programs: ${actual.loan_programs?.join(", ")}`,
        },
      ],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : raw);
  } catch {
    return { score: 5, rationale: "Judge evaluation failed" };
  }
}

export async function GET(): Promise<Response> {
  return Response.json(goldenDataset);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = body.ids;
    const profiles = (goldenDataset as EvalProfile[]).filter(
      (p) => !ids || ids.includes(p.id)
    );

    await ensureIngested();

    const results: EvalResult[] = [];

    for (const evalProfile of profiles) {
      const qualification = await qualifyProfile(evalProfile.profile);
      if (!qualification) {
        results.push({
          id: evalProfile.id,
          description: evalProfile.description,
          category: evalProfile.category,
          expectedStatus: evalProfile.expectedStatus,
          actualStatus: "fail",
          overall_confidence: 0,
          judgeScore: 0,
          judgeRationale: "Qualification failed to run",
          match: false,
        });
        continue;
      }

      const judge = await judgeResult(evalProfile.expectedStatus, qualification, evalProfile.category);
      const match = qualification.overall_status === evalProfile.expectedStatus;

      results.push({
        id: evalProfile.id,
        description: evalProfile.description,
        category: evalProfile.category,
        expectedStatus: evalProfile.expectedStatus,
        actualStatus: qualification.overall_status,
        overall_confidence: qualification.overall_confidence,
        judgeScore: judge.score,
        judgeRationale: judge.rationale,
        match,
      });
    }

    const accuracy = results.filter((r) => r.match).length / results.length;
    const byCategory: Record<string, { total: number; correct: number }> = {};
    for (const r of results) {
      if (!byCategory[r.category]) byCategory[r.category] = { total: 0, correct: 0 };
      byCategory[r.category].total++;
      if (r.match) byCategory[r.category].correct++;
    }

    return Response.json({
      results,
      summary: {
        total: results.length,
        correct: results.filter((r) => r.match).length,
        accuracy: parseFloat((accuracy * 100).toFixed(1)),
        avgJudgeScore: parseFloat((results.reduce((s, r) => s + r.judgeScore, 0) / results.length).toFixed(1)),
        byCategory,
      },
    });
  } catch (err) {
    console.error("[evals] error:", err);
    return Response.json({ error: "Eval run failed" }, { status: 500 });
  }
}
