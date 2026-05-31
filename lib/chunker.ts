const CHUNK_SIZE = 500;
const OVERLAP = 50;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 0);
}

export function chunkText(text: string, source: string): Array<{ id: string; text: string; source: string; chunkIndex: number }> {
  const sentences = splitIntoSentences(text);
  const chunks: Array<{ id: string; text: string; source: string; chunkIndex: number }> = [];

  let current: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  const flush = () => {
    if (current.length === 0) return;
    const text = current.join(" ");
    chunks.push({ id: `${source}-${chunkIndex}`, text, source, chunkIndex });
    chunkIndex++;

    // Keep last OVERLAP tokens worth of sentences for next chunk
    const overlapSentences: string[] = [];
    let overlapTokens = 0;
    for (let i = current.length - 1; i >= 0; i--) {
      const t = estimateTokens(current[i]);
      if (overlapTokens + t > OVERLAP) break;
      overlapSentences.unshift(current[i]);
      overlapTokens += t;
    }
    current = overlapSentences;
    currentTokens = overlapTokens;
  };

  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    if (currentTokens + tokens > CHUNK_SIZE) {
      flush();
    }
    current.push(sentence);
    currentTokens += tokens;
  }
  flush();

  return chunks;
}
