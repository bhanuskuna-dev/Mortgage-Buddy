import type { VectorChunk, RegulatoryChunk } from "./types";

// ── TF-IDF helpers ────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function buildTFIDF(tokens: string[], corpus: string[][]): number[] {
  const vocab = Array.from(new Set(corpus.flat()));
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  const total = tokens.length || 1;

  return vocab.map((term) => {
    const termTF = (tf[term] ?? 0) / total;
    const docsWithTerm = corpus.filter((doc) => doc.includes(term)).length;
    const idf = Math.log((corpus.length + 1) / (docsWithTerm + 1)) + 1;
    return termTF * idf;
  });
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Voyage AI embedding (with TF-IDF fallback) ────────────────────────────────

async function embedVoyage(text: string): Promise<number[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/embeddings", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "voyage-3", input: [text] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── ChromaStore ───────────────────────────────────────────────────────────────

export class ChromaStore {
  private store: VectorChunk[] = [];
  private corpus: string[][] = [];
  private queryCache = new Map<string, RegulatoryChunk[]>();
  private useVoyage = true;

  async add(chunks: Omit<VectorChunk, "embedding">[]): Promise<void> {
    const newCorpus = chunks.map((c) => tokenize(c.text));
    const allCorpus = [...this.corpus, ...newCorpus];

    const withEmbeddings: VectorChunk[] = [];
    for (let i = 0; i < chunks.length; i++) {
      let embedding: number[];
      if (this.useVoyage) {
        const vec = await embedVoyage(chunks[i].text);
        if (vec) {
          embedding = vec;
        } else {
          this.useVoyage = false;
          embedding = buildTFIDF(newCorpus[i], allCorpus);
        }
      } else {
        embedding = buildTFIDF(newCorpus[i], allCorpus);
      }
      withEmbeddings.push({ ...chunks[i], embedding });
    }

    // Re-build TF-IDF embeddings for all existing chunks when Voyage isn't used,
    // because the IDF values change as corpus grows.
    if (!this.useVoyage && this.store.length > 0) {
      const allNew = [...allCorpus];
      this.store = this.store.map((existing, idx) => ({
        ...existing,
        embedding: buildTFIDF(this.corpus[idx], allNew),
      }));
    }

    this.store.push(...withEmbeddings);
    this.corpus.push(...newCorpus);
    this.queryCache.clear();
  }

  async query(queryText: string, topK = 5): Promise<RegulatoryChunk[]> {
    const cacheKey = `${queryText}:${topK}`;
    if (this.queryCache.has(cacheKey)) return this.queryCache.get(cacheKey)!;
    if (this.store.length === 0) return [];

    let queryEmbedding: number[];
    if (this.useVoyage) {
      const vec = await embedVoyage(queryText);
      if (vec) {
        queryEmbedding = vec;
      } else {
        this.useVoyage = false;
        queryEmbedding = buildTFIDF(tokenize(queryText), this.corpus);
      }
    } else {
      queryEmbedding = buildTFIDF(tokenize(queryText), this.corpus);
    }

    const scored = this.store.map((chunk) => ({
      ...chunk,
      score: cosine(queryEmbedding, chunk.embedding),
    }));

    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ embedding: _e, ...rest }) => rest);

    if (this.queryCache.size >= 50) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) this.queryCache.delete(firstKey);
    }
    this.queryCache.set(cacheKey, results);
    return results;
  }

  getCount(): number {
    return this.store.length;
  }

  clear(): void {
    this.store = [];
    this.corpus = [];
    this.queryCache.clear();
  }
}

// Module-level singleton — persists across requests in same Node.js process
export const regulatoryStore = new ChromaStore();
