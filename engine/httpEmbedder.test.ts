import { describe, it, expect, vi } from "vitest";
import { HttpEmbedder } from "./httpEmbedder";

describe("HttpEmbedder", () => {
  it("posts texts with the bearer key and returns the embeddings in order", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ embedding: [1, 2, 3] }, { embedding: [4, 5, 6] }] }) })) as any;
    const e = new HttpEmbedder({ apiKey: "k", model: "voyage-3-lite", fetchImpl: f });
    const out = await e.embed(["a", "b"]);
    expect(out).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer k");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ input: ["a", "b"], model: "voyage-3-lite" });
  });
  it("returns [] for no input without calling the API", async () => {
    const f = vi.fn() as any;
    expect(await new HttpEmbedder({ apiKey: "k", model: "m", fetchImpl: f }).embed([])).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
