import { regulatoryStore } from "./vectorStore";
import { chunkText } from "./chunker";

const PDF_SOURCES = [
  {
    name: "Fannie Mae Selling Guide",
    url: "https://www.fanniemae.com/sites/g/files/koqyhd191/files/2024-08/sel-2024-07.pdf",
  },
  {
    name: "CFPB ATR/QM Rule",
    url: "https://files.consumerfinance.gov/f/documents/cfpb_ability-to-repay-qualified-mortgage_small-entity_guide.pdf",
  },
  {
    name: "FHA Handbook",
    url: "https://www.hud.gov/sites/dfiles/OCHCO/documents/4000.1hsgh.pdf",
  },
];

// Hardcoded stub facts used when PDF fetch fails
const REGULATORY_STUBS = [
  { source: "CFPB ATR/QM Rule", text: "The Ability-to-Repay (ATR) rule requires lenders to make a reasonable, good-faith determination that a borrower has the ability to repay a mortgage loan. A Qualified Mortgage (QM) provides a safe harbor or rebuttable presumption of ATR compliance." },
  { source: "CFPB ATR/QM Rule", text: "General QM loans must have a debt-to-income ratio of 43% or less. The DTI ratio compares total monthly debt obligations to gross monthly income. Points and fees may not exceed 3% of the total loan amount for most QM loans." },
  { source: "CFPB ATR/QM Rule", text: "Under the ATR rule, lenders must consider and verify: current or expected income, employment status, monthly mortgage payment, monthly payments on simultaneous loans, monthly payments for mortgage-related obligations, current debt obligations, monthly debt-to-income ratio, and credit history." },
  { source: "Fannie Mae Selling Guide", text: "For conventional conforming loans, the maximum debt-to-income ratio is generally 45% with DU approval, though 36% or less is preferred. The 2026 conforming loan limit is $806,500 for single-family properties in most areas." },
  { source: "Fannie Mae Selling Guide", text: "Conventional loans require a minimum credit score of 620. Borrowers with credit scores below 620 are not eligible for conventional conforming loans. Loans with LTV above 80% require private mortgage insurance (PMI)." },
  { source: "Fannie Mae Selling Guide", text: "Self-employed borrowers must provide two years of personal and business tax returns. The lender must verify that the borrower has been self-employed for at least two years. One year may be accepted in limited circumstances with strong compensating factors." },
  { source: "Fannie Mae Selling Guide", text: "The maximum LTV ratio for a conventional purchase loan is 97% for one-unit primary residences with qualifying first-time homebuyers. Standard purchase transactions allow up to 95% LTV. Investment properties have lower LTV limits." },
  { source: "FHA Handbook", text: "FHA loans require a minimum credit score of 580 for maximum financing (3.5% down payment). Borrowers with credit scores between 500-579 may be eligible with a 10% down payment. Borrowers with scores below 500 are not eligible for FHA financing." },
  { source: "FHA Handbook", text: "FHA maximum debt-to-income ratios are 31% front-end and 43% back-end. However, ratios up to 40% front-end and 50% back-end may be approved with compensating factors such as significant cash reserves, minimal payment shock, or verified additional income." },
  { source: "FHA Handbook", text: "FHA loans require an upfront mortgage insurance premium (UFMIP) of 1.75% of the loan amount, plus an annual mortgage insurance premium (MIP) ranging from 0.45% to 1.05% depending on LTV and loan term. MIP is required for the life of the loan if LTV is greater than 90% at origination." },
  { source: "FHA Handbook", text: "The maximum FHA loan limit varies by geographic area. FHA defines floor and ceiling limits based on median home prices. The floor is 65% of the conforming loan limit and the ceiling is 150% of the conforming loan limit." },
  { source: "CFPB ATR/QM Rule", text: "Equal Credit Opportunity Act (ECOA) and the Fair Housing Act prohibit discrimination in lending based on race, color, religion, national origin, sex, marital status, age, familial status, or disability. Lenders must document that credit decisions are based solely on creditworthiness factors." },
  { source: "Fannie Mae Selling Guide", text: "Private Mortgage Insurance (PMI) is required for conventional loans with a loan-to-value ratio greater than 80%. PMI protects the lender in case of borrower default. Borrowers may request PMI cancellation when LTV reaches 80% based on original value, or when it reaches 78% through scheduled payments." },
  { source: "CFPB ATR/QM Rule", text: "Jumbo loans (above the conforming loan limit) are not eligible for purchase by Fannie Mae or Freddie Mac. Jumbo loans typically require stronger qualifications: credit scores of 700 or higher, DTI of 43% or less, and reserves of 6-12 months of payments." },
  { source: "Fannie Mae Selling Guide", text: "VA loans are guaranteed by the Department of Veterans Affairs for eligible veterans, service members, and surviving spouses. VA loans do not require a down payment or private mortgage insurance. The VA funding fee ranges from 1.25% to 3.3% of the loan amount." },
];

let ingestionComplete = false;
let ingestionInProgress: Promise<void> | null = null;

async function ingestPDF(name: string, url: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  const buffer = await response.arrayBuffer();
  const { PDFParse } = await import("pdf-parse");
  const buf = Buffer.from(buffer);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  const chunks = chunkText(result.text, name);

  await regulatoryStore.add(chunks);
  console.log(`[RAG] Ingested ${chunks.length} chunks from "${name}"`);
}

async function runIngestion(): Promise<void> {
  let anySucceeded = false;

  for (const src of PDF_SOURCES) {
    try {
      await ingestPDF(src.name, src.url);
      anySucceeded = true;
    } catch (err) {
      console.warn(`[RAG] Failed to fetch "${src.name}": ${err}. Continuing...`);
    }
  }

  if (!anySucceeded) {
    console.warn("[RAG] All PDF sources failed. Loading regulatory stub dataset.");
    await regulatoryStore.add(
      REGULATORY_STUBS.map((s, i) => ({
        id: `stub-${i}`,
        text: s.text,
        source: s.source,
        chunkIndex: i,
      }))
    );
  }

  ingestionComplete = true;
  console.log(`[RAG] Ingestion complete. Store size: ${regulatoryStore.getCount()}`);
}

export async function ensureIngested(): Promise<void> {
  if (ingestionComplete) return;
  if (ingestionInProgress) {
    await ingestionInProgress;
    return;
  }
  ingestionInProgress = runIngestion();
  await ingestionInProgress;
  ingestionInProgress = null;
}

export function getStoreSize(): number {
  return regulatoryStore.getCount();
}

export function isIngested(): boolean {
  return ingestionComplete;
}
