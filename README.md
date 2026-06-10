# MortgageReady

AI-powered mortgage qualification tool demonstrating production-grade AI product engineering. Built on a 5-stage pipeline grounded in federal regulatory documents (Fannie Mae Selling Guide, CFPB ATR/QM Rule, FHA Handbook).

**Live demo:** deployed on Vercel  
**Stack:** Next.js 16 · Tailwind CSS v4 · Claude API · TF-IDF vector store · localStorage observability

---

## Why RAG Over Fine-Tuning for Regulatory Content

Mortgage regulations change constantly — conforming loan limits adjust annually, DTI thresholds shift with agency guidance, MIP rates are revised by HUD, and new QM rule amendments are issued by CFPB. Fine-tuning bakes a snapshot of these rules into model weights at training time. By the time a fine-tuned model ships, some of those numbers are already stale.

RAG solves this by keeping the authoritative source documents as the ground truth. When regulations update, you replace the PDF — no retraining required. It also provides mandatory auditability: every claim in a qualification assessment cites a specific retrieved chunk, so you can trace exactly which regulatory text drove each decision. A fine-tuned model can hallucinate plausible-sounding rule numbers; a RAG system either finds the rule in the documents or says it isn't there.

The chunking strategy (500-token sentence-aware chunks, 50-token overlap) preserves the semantic coherence of regulatory clauses. A single clause about DTI limits or compensating factors typically fits within one chunk, so retrieval returns complete, actionable regulatory text rather than truncated mid-clause fragments.

---

## ATR/QM Rule Implementation Decisions

The Ability-to-Repay rule requires lenders to make a reasonable, good-faith determination that a borrower can repay a loan. MortgageReady implements it as an 8-factor structured assessment:

1. **Income Verification** — employment type flags what documentation is needed (W-2 vs 2yr tax returns for self-employed)
2. **Employment Stability** — self-employed triggers HITL because income verification requires underwriter judgment
3. **DTI Assessment** — three-tier logic: conventional/jumbo QM max 43%, FHA standard 43% back-end (up to 50% with compensating factors). DTI within 2% of the limit triggers HITL
4. **LTV Assessment** — conventional max 97%, FHA max 96.5%, VA up to 100%
5. **Credit Score** — conventional min 620, FHA min 580 (3.5% down) or 500 (10% down), VA 620 lender overlay. Credit within 20 points of minimum triggers HITL
6. **Loan Program Match** — determines which programs the borrower qualifies for given the combination of all factors
7. **QM Determination** — eligible, non-QM, or borderline based on DTI, loan type, and documentation
8. **Fair Lending Compliance** — always pass; ECOA guardrail upstream ensures no protected factors enter the pipeline

The qualification agent (claude-sonnet-4-6) receives pre-computed calculator results alongside retrieved regulatory chunks. Separating deterministic math (Stage 2) from AI reasoning (Stage 4) means the DTI and LTV numbers are always correct — the AI focuses on interpretation and program matching rather than arithmetic.

---

## Fair Lending Guardrail Design

The guardrail runs on every input before any other processing using claude-haiku-4-5 with a focused classification prompt. It checks for:

- **ECOA protected characteristics** — race, color, religion, sex, national origin, age, marital status, familial status
- **Prompt injection** — attempts to override system instructions
- **PII** — SSN patterns (`XXX-XX-XXXX`), full dates of birth
- **Off-topic requests** — content unrelated to mortgage or home financing

The guardrail returns structured JSON `{"pass": bool, "flagged_category": string | null}` and fails open on API errors (a network blip should not block legitimate borrowers). The UI shows a green shield on pass and a red shield with the specific rejection reason on fail.

The qualification agent prompt separately instructs the model that fair lending compliance is always "pass" and that ECOA-protected characteristics are never considered in any factor assessment. This double-layer design — guardrail at input + explicit instruction at reasoning — is tested in the golden dataset with 5 dedicated ECOA test cases targeting 100% accuracy.

---

## Chunking Strategy Rationale

**500-token chunks, 50-token overlap, sentence-aware splitting.**

500 tokens is large enough to contain a complete regulatory clause (e.g., a full DTI limit definition with its exceptions) but small enough that the top-5 retrieved chunks fit within Claude's context window without crowding out the borrower profile and calculator results.

Sentence-aware splitting (splitting on `.`, `!`, `?` boundaries rather than fixed token counts) prevents chunks from cutting mid-sentence, which would make individual chunks semantically incoherent and confuse the qualification agent.

The 50-token overlap ensures that information straddling a chunk boundary (e.g., a condition defined at the end of one paragraph and its threshold in the next) appears in at least one chunk's full context.

Source metadata (document name + chunk index) is stored with every embedding so citations are always traceable to the original document and approximate location.

---

## Eval Design and Golden Dataset Construction

The golden dataset (`data/golden-dataset.json`) has 25 profiles designed to test distinct failure modes:

**10 clearly qualified** — strong W-2 income, DTI well below 43%, credit above 700, adequate down payment. These validate that the system doesn't over-flag good borrowers. Target: ≥90% accuracy.

**10 clearly not qualified** — DTI above 55%, credit below 580, insufficient down payment, or combinations that fail multiple factors simultaneously. These validate that the system catches bad applications. Target: ≥90% accuracy.

**5 borderline** — DTI 40–43%, fair credit 650–680, self-employed income, or near-jumbo loan amounts. These are the most valuable test cases because they exercise the HITL trigger logic and confidence calibration. Target: ≥80% accuracy.

**Cost optimization in eval runner:** Haiku judges clear-case profiles (20 of 25), Sonnet only for borderline profiles. This cuts eval runner cost by ~80% while preserving quality where it matters most.

**Claude-as-judge scoring (0–10):**
- 10: Correct status, well-cited factors, accurate confidence calibration
- 7–9: Correct status, minor explanation quality issues
- 4–6: Correct status, weak reasoning or vague citations
- 1–3: Wrong status or compliance issues
- 0: Fair lending violation or dangerous output

---

## Known Limitations

- **Cold start re-ingestion** — Vercel serverless functions are stateless. The regulatory store (in-memory TF-IDF) resets on cold starts and must re-ingest PDFs on the first request. The app falls back to a hardcoded stub dataset of 15 key regulatory facts if PDF fetching fails or times out.
- **Credit score range, not bureau pull** — credit is entered as a band (excellent/good/fair/poor) mapped to a midpoint FICO. Actual qualification depends on the precise score.
- **Income estimates from documents** — extracted income from W-2s and pay stubs is an approximation for form pre-fill, not verified income for underwriting.
- **VA eligibility not verified** — the app matches VA loan programs based on loan type selection; actual VA eligibility requires Certificate of Eligibility.
- **County-level conforming limits** — high-cost areas (e.g., San Francisco, NYC) have higher conforming limits than the national baseline ($806,500). Only the national limit is used.
- **No rate lock or APR modeling** — interest rate estimates are static ranges by credit band, not live rates.
- **Single-unit primary residence assumed** — multi-unit, investment property, and second home LTV/DTI limits are not modeled.

---

## How This Would Scale in Production

| Component | Current | Production |
|---|---|---|
| Vector store | In-memory TF-IDF, resets on cold start | Pinecone or pgvector with persistent embeddings |
| PDF ingestion | Lazy at runtime, re-runs on cold start | Pre-ingested at build time, embeddings shipped as static asset |
| Embeddings | TF-IDF fallback | Voyage AI `voyage-3` via Anthropic API, batch-processed |
| Credit score | Self-reported band | Soft-pull via Experian/Equifax API |
| Observability | localStorage, last 100 traces | Datadog or PostHog with session replay |
| Auth | None | Clerk or Auth0, required before qualify endpoint |
| Rate limiting | None | Upstash Redis token bucket, 10 req/min per IP |
| HITL routing | UI flag only | Webhook to loan officer CRM (Salesforce, Encompass) |
| Audit log | None | Immutable append-only log (anonymized) for model monitoring |
| Regulatory updates | Manual PDF swap | Scheduled job to re-fetch and re-index PDFs monthly |

---

## Prompt Versioning Approach

All prompts live in `lib/prompts.ts` as named exports with version suffixes:

```
GUARDRAILS_PROMPT_V1   — ECOA + injection + PII classification
QUALIFICATION_PROMPT_V1 — 8-factor ATR assessment
QUALIFICATION_PROMPT_V2 — V2 adds explicit compensating factor language and structured confidence reasoning
COACH_PROMPT_V1        — Citation-mandatory mortgage coach
COACH_PROMPT_V2        — V2 adds structured response format and confidence breakdown
EVAL_JUDGE_PROMPT_V1   — Claude-as-judge scoring rubric
```

`PROMPT_VERSIONS` in the same file controls which version is active per stage. Every API call returns the active prompt version in the `X-Prompt-Version` response header, which the client logs to the observability trace.

The observability dashboard groups performance metrics by prompt version, enabling systematic A/B comparison: switch `PROMPT_VERSIONS.QUALIFICATION` from `"v1"` to `"v2"`, run the eval suite, and compare average confidence, accuracy, and judge scores between versions in the dashboard.

---

## Local Development

```bash
git clone https://github.com/bhanuskuna-dev/Mortgage-Buddy
cd Mortgage-Buddy
npm install
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Disclaimer

MortgageReady is an educational tool only and does not constitute legal or lending advice. Consult a licensed mortgage professional for personalized guidance.
