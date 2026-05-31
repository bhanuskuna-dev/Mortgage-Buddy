import { ensureIngested, getStoreSize, isIngested } from "@/lib/regulatoryChecks";
import { regulatoryStore } from "@/lib/vectorStore";

export async function POST(req: Request): Promise<Response> {
  const start = Date.now();
  try {
    const body = await req.json();
    const query: string = body.query ?? "";
    const topK: number = body.topK ?? 5;

    await ensureIngested();

    const chunks = await regulatoryStore.query(query, topK);

    return Response.json(
      { chunks, storeSize: getStoreSize() },
      {
        headers: {
          "X-Chunks-Retrieved": String(chunks.length),
          "X-Store-Size": String(getStoreSize()),
          "X-Latency-Ms": String(Date.now() - start),
        },
      }
    );
  } catch (err) {
    console.error("[retrieve] error:", err);
    return Response.json({ error: "Retrieval failed", chunks: [] }, { status: 500 });
  }
}

// Warmup endpoint
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("warmup") === "1") {
    ensureIngested().catch(console.error); // fire and forget
    return Response.json({ status: "warming_up", ingested: isIngested(), storeSize: getStoreSize() });
  }
  return Response.json({ ingested: isIngested(), storeSize: getStoreSize() });
}
