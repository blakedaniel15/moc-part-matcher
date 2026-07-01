import type { Embedder } from "./embedder";
import { memberText } from "./embedder";
import { neighborsFor, type Neighbor, type Retriever, type RetrievalConfig, type WellMember } from "./retrieval";

// Composes a (hosted) Embedder with a loaded well + thresholds. Embeds a batch of
// candidates once, then scores each against every well-member (in-process cosine for
// v1; a pgvector ANN query at scale).
export class WellRetriever implements Retriever {
  readonly config: RetrievalConfig;
  private embedder: Embedder;
  private well: WellMember[];
  constructor(deps: { embedder: Embedder; well: WellMember[]; config: RetrievalConfig }) {
    this.embedder = deps.embedder;
    this.well = deps.well;
    this.config = deps.config;
  }

  async score(items: { sku: string; partName: string }[]): Promise<Map<string, Neighbor[]>> {
    const out = new Map<string, Neighbor[]>();
    if (items.length === 0 || this.well.length === 0) return out;
    const vecs = await this.embedder.embed(items.map((i) => memberText(i.partName)));
    items.forEach((it, i) => out.set(it.sku, neighborsFor(vecs[i] ?? [], this.well)));
    return out;
  }
}
