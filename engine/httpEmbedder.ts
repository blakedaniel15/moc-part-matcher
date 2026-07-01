import type { Embedder } from "./embedder";

export interface HttpEmbedderDeps {
  apiKey: string;
  model: string;
  url?: string; // defaults to Voyage; any {input, model} -> {data:[{embedding}]} API works
  fetchImpl?: typeof fetch;
}

// Generic embeddings client for the hosted provider (Voyage AI by default, but the
// request/response shape is OpenAI-compatible, so the provider is swappable via env).
export class HttpEmbedder implements Embedder {
  constructor(private deps: HttpEmbedderDeps) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const f = this.deps.fetchImpl ?? fetch;
    const url = this.deps.url ?? "https://api.voyageai.com/v1/embeddings";
    const res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.deps.apiKey}` },
      body: JSON.stringify({ input: texts, model: this.deps.model }),
    });
    if (!(res as any).ok) throw new Error(`Embedder HTTP ${(res as any).status}`);
    const data = await (res as any).json();
    // { data: [{ embedding: number[] }, ...] } — Voyage & OpenAI both use this shape.
    return (data.data ?? []).map((d: any) => d.embedding as number[]);
  }
}
