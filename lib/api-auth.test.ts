import { describe, it, expect } from "vitest";
import { checkBearer } from "./api-auth";

describe("checkBearer", () => {
  it("accepts the exact bearer token", () => {
    expect(checkBearer("Bearer abc123", "abc123")).toBe(true);
  });
  it("rejects wrong/missing token or empty expected", () => {
    expect(checkBearer("Bearer nope", "abc123")).toBe(false);
    expect(checkBearer(null, "abc123")).toBe(false);
    expect(checkBearer("Bearer abc123", "")).toBe(false);
  });
});
