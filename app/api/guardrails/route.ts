import Anthropic from "@anthropic-ai/sdk";
import { GUARDRAILS_PROMPT_V1, PROMPT_VERSIONS } from "@/lib/prompts";
import type { GuardrailResult } from "@/lib/types";

const client = new Anthropic();

const REJECTION_MESSAGES: Record<string, string> = {
  ecoa: "MortgageReady cannot consider protected characteristics under the Equal Credit Opportunity Act. Mortgage decisions must be based solely on creditworthiness factors.",
  injection: "This query appears to attempt to override AI instructions. Please ask a mortgage-related question.",
  pii: "Your query appears to contain sensitive personal information (SSN or date of birth). Please do not share this information — it is not needed for our educational assessment.",
  off_topic: "MortgageReady focuses on mortgage qualification and home financing questions. Please ask something related to mortgages, lending, or home buying.",
};

export async function POST(req: Request): Promise<Response> {
  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return Response.json({ pass: true, reason: "", flagged_category: null });
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: GUARDRAILS_PROMPT_V1,
      messages: [{ role: "user", content: query }],
    });

    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const result: GuardrailResult = JSON.parse(match ? match[0] : raw);

    if (!result.pass && result.flagged_category) {
      result.reason = REJECTION_MESSAGES[result.flagged_category] ?? result.reason;
    }

    const latencyMs = Date.now() - start;
    return Response.json(result, {
      headers: {
        "X-Tokens-Input": String(inputTokens),
        "X-Tokens-Output": String(outputTokens),
        "X-Model": "claude-haiku-4-5-20251001",
        "X-Prompt-Version": PROMPT_VERSIONS.GUARDRAILS,
        "X-Latency-Ms": String(latencyMs),
      },
    });
  } catch (err) {
    console.error("[guardrails] error:", err);
    // Fail open — don't block legitimate requests if guardrails are down
    return Response.json(
      { pass: true, reason: "", flagged_category: null },
      {
        headers: {
          "X-Tokens-Input": String(inputTokens),
          "X-Tokens-Output": String(outputTokens),
          "X-Model": "claude-haiku-4-5-20251001",
          "X-Prompt-Version": PROMPT_VERSIONS.GUARDRAILS,
          "X-Latency-Ms": String(Date.now() - start),
        },
      }
    );
  }
}
