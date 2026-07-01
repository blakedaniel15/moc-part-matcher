// The embedding seam — kept behind an interface so the retrieval logic is pure and
// testable, and the hosted provider (Voyage/OpenAI/…) is swapped in at the edge.
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

// Test/eval double: returns fixed vectors by text (zero-vector for unknowns).
export class RecordedEmbedder implements Embedder {
  constructor(private vectors: Record<string, number[]>, private dim = 3) {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectors[t] ?? new Array(this.dim).fill(0));
  }
}

// The string we embed for a member or a candidate — the product/part description,
// normalized. (The SKU/number itself is handled by the deterministic passes; the
// semantic layer is about how the part is *described*.)
export function memberText(name: string): string {
  return String(name || "")
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Cosine similarity in [-1, 1]. Used by the DB (pgvector) in prod; here for tests
// and any in-process scoring.
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
