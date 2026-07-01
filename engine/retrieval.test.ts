import { describe, it, expect } from "vitest";
import { decideRetrieval, validateAgainst, rankProducts, type Neighbor, type RetrievalConfig } from "./retrieval";
import { cosine, memberText } from "./embedder";

const cfg: RetrievalConfig = { floor: 0.6, strong: 0.8, margin: 0.1 };

describe("decideRetrieval", () => {
  it("confident single-product fit => match", () => {
    const n: Neighbor[] = [
      { barePartNumber: "02531", similarity: 0.94 },
      { barePartNumber: "02531", similarity: 0.88 },
      { barePartNumber: "01121", similarity: 0.55 }, // below floor, ignored
    ];
    const v = decideRetrieval(n, cfg);
    expect(v).toMatchObject({ decision: "match", barePartNumber: "02531", confidence: "HIGH" });
  });
  it("two products with no clear margin => ambiguous (go to AI)", () => {
    const n: Neighbor[] = [
      { barePartNumber: "02531", similarity: 0.83 },
      { barePartNumber: "01121", similarity: 0.81 },
    ];
    expect(decideRetrieval(n, cfg).decision).toBe("ambiguous");
  });
  it("near a product but below the strong bar => ambiguous", () => {
    const n: Neighbor[] = [{ barePartNumber: "02531", similarity: 0.7 }];
    expect(decideRetrieval(n, cfg).decision).toBe("ambiguous");
  });
  it("nothing clears the floor => none (defer to existing path)", () => {
    const n: Neighbor[] = [{ barePartNumber: "02531", similarity: 0.4 }];
    expect(decideRetrieval(n, cfg).decision).toBe("none");
  });
  it("clean 2a-style margin picks the best product", () => {
    expect(rankProducts([{ barePartNumber: "A", similarity: 0.9 }, { barePartNumber: "B", similarity: 0.7 }], 0.6)).toEqual([
      { barePartNumber: "A", score: 0.9 },
      { barePartNumber: "B", score: 0.7 },
    ]);
  });
});

describe("validateAgainst (discriminative veto)", () => {
  it("fits: candidate is close to a confirmed member of the proposed product", () => {
    const n: Neighbor[] = [{ barePartNumber: "01211", similarity: 0.85 }];
    expect(validateAgainst(n, "01211", cfg)).toBe("fits");
  });
  it("outlier: we HAVE a well for the product but the candidate is far from all of it => veto", () => {
    const n: Neighbor[] = [
      { barePartNumber: "01211", similarity: 0.42 },
      { barePartNumber: "01211", similarity: 0.38 },
    ];
    expect(validateAgainst(n, "01211", cfg)).toBe("outlier");
  });
  it("unknown: no confirmed members for the product => don't veto (novel)", () => {
    const n: Neighbor[] = [{ barePartNumber: "99999", similarity: 0.9 }];
    expect(validateAgainst(n, "01211", cfg)).toBe("unknown");
  });
});

describe("embedder helpers", () => {
  it("memberText normalizes casing/whitespace/symbols", () => {
    expect(memberText("  ATF  Exchange Kit™ ")).toBe("ATF EXCHANGE KIT");
  });
  it("cosine of identical vectors is 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
