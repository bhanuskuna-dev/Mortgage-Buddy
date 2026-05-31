import Anthropic from "@anthropic-ai/sdk";
import { ensureIngested } from "@/lib/regulatoryChecks";
import { regulatoryStore } from "@/lib/vectorStore";
import { COACH_PROMPT_V1, GUARDRAILS_PROMPT_V1, PROMPT_VERSIONS } from "@/lib/prompts";
import type { GuardrailResult } from "@/lib/types";

const client = new Anthropic();

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
  try {
    const { message, history = [] } = await req.json();

    // Guardrails
    const guard = await runGuardrails(message);
    if (!guard.pass) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "blocked", reason: guard.reason })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // RAG retrieval (3 chunks for cost efficiency in chat)
    await ensureIngested();
    const chunks = await regulatoryStore.query(message, 3);
    const ragContext = chunks.length > 0
      ? chunks.map((c, i) => `[Source ${i + 1}] ${c.source}:\n${c.text.slice(0, 300)}`).join("\n\n")
      : "No specific regulatory documents retrieved for this query.";

    const systemPrompt = `${COACH_PROMPT_V1}\n\nREGULATORY CONTEXT:\n${ragContext}`;

    // Build conversation history
    const messages = [
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    // Stream response
    const encoder = new TextEncoder();
    let inputTokens = 0;
    let outputTokens = 0;
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 800,
            system: systemPrompt,
            messages,
          });

          for await (const event of anthropicStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullText += event.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "d", v: event.delta.text })}\n\n`));
            }
            if (event.type === "message_delta") {
              outputTokens = event.usage?.output_tokens ?? 0;
            }
            if (event.type === "message_start") {
              inputTokens = event.message.usage?.input_tokens ?? 0;
            }
          }

          // Extract confidence from response
          const confidenceMatch = fullText.match(/CONFIDENCE:\s*([\d.]+)/i);
          const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7;
          const latencyMs = Date.now() - start;

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                t: "r",
                sources: chunks.map((c, i) => ({ index: i + 1, source: c.source })),
                confidence,
                inputTokens,
                outputTokens,
                model: "claude-sonnet-4-6",
                promptVersion: PROMPT_VERSIONS.COACH,
                latencyMs,
              })}\n\n`
            )
          );
        } catch (err) {
          console.error("[chat stream] error:", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "error", message: "Stream failed" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[chat] error:", err);
    return Response.json({ error: "Chat failed" }, { status: 500 });
  }
}
