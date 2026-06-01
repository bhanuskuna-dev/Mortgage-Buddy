import Anthropic from "@anthropic-ai/sdk";
import type { EmploymentType } from "@/lib/types";

const client = new Anthropic();

export interface ParsedDocumentData {
  document_type: "w2" | "tax_return_1040" | "pay_stub" | "bank_statement" | "other";
  gross_annual_income: number | null;
  gross_monthly_income: number | null;
  employer_name: string | null;
  employment_type: EmploymentType | null;
  tax_year: number | null;
  monthly_debts: number | null;
  confidence: number;
  fields_found: string[];
  notes: string;
}

const EXTRACT_PROMPT = `You are a mortgage document analyst. Extract financial data from this document to help pre-fill a mortgage qualification form.

Return ONLY valid JSON in this exact structure:
{
  "document_type": "w2|tax_return_1040|pay_stub|bank_statement|other",
  "gross_annual_income": <number or null>,
  "gross_monthly_income": <number or null — derive from annual if needed>,
  "employer_name": "<string or null>",
  "employment_type": "W2|self_employed|retired|other",
  "tax_year": <year number or null>,
  "monthly_debts": <total monthly debt obligations if visible, or null>,
  "confidence": <0.0-1.0 — how confident you are in the extracted values>,
  "fields_found": ["income", "employer", ...],
  "notes": "<brief note about what was found or any caveats>"
}

Rules:
- For W-2: use Box 1 (Wages) for gross_annual_income
- For 1040: use Line 1z or total income line for gross_annual_income
- For pay stubs: annualize the gross pay shown
- For bank statements: sum regular deposits as proxy income (lower confidence)
- Never guess — use null if a field is not clearly present in the document
- Do not extract SSN, full DOB, or account numbers`;

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

export async function POST(req: Request): Promise<Response> {
  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return Response.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf" || file.name.endsWith(".pdf");

    if (!isImage && !isPDF) {
      return Response.json({ error: "Only PDF and image files are supported" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let response;

    if (isImage) {
      // Use Claude Vision directly for images
      const base64 = buffer.toString("base64");
      const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: EXTRACT_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: `Extract mortgage qualification data from this document (${file.name}). Return the JSON.`,
              },
            ],
          },
        ],
      });
    } else {
      // PDF: extract text first, then send to Claude
      let text: string;
      try {
        text = await extractTextFromPDF(buffer);
      } catch {
        // If PDF text extraction fails, try as image via base64
        const base64 = buffer.toString("base64");
        response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: EXTRACT_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: base64 },
                },
                {
                  type: "text",
                  text: `Extract mortgage qualification data from this PDF document (${file.name}). Return the JSON.`,
                },
              ],
            },
          ],
        });
        text = "";
      }

      if (!response) {
        // Truncate to avoid token limits — first 6000 chars covers most tax docs
        const truncatedText = text.slice(0, 6000);
        response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: EXTRACT_PROMPT,
          messages: [
            {
              role: "user",
              content: `Document filename: ${file.name}\n\nDocument text:\n${truncatedText}\n\nExtract the mortgage qualification data and return JSON.`,
            },
          ],
        });
      }
    }

    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed: ParsedDocumentData = JSON.parse(match ? match[0] : raw);

    // Derive monthly from annual if only one is present
    if (parsed.gross_annual_income && !parsed.gross_monthly_income) {
      parsed.gross_monthly_income = Math.round(parsed.gross_annual_income / 12);
    } else if (parsed.gross_monthly_income && !parsed.gross_annual_income) {
      parsed.gross_annual_income = parsed.gross_monthly_income * 12;
    }

    const latencyMs = Date.now() - start;
    return Response.json(
      { data: parsed, filename: file.name },
      {
        headers: {
          "X-Tokens-Input": String(inputTokens),
          "X-Tokens-Output": String(outputTokens),
          "X-Model": "claude-haiku-4-5-20251001",
          "X-Latency-Ms": String(latencyMs),
        },
      }
    );
  } catch (err) {
    console.error("[parse-document] error:", err);
    return Response.json({ error: "Document parsing failed. Please try a clearer image or text-based PDF." }, { status: 500 });
  }
}
