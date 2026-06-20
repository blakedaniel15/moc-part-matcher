import { describe, it, expect } from "vitest";
import { config, requireEnv } from "./config";

describe("config", () => {
  it("defaults model and batch size", () => {
    expect(config.anthropicModel).toBeTruthy();
    expect(config.batchSize).toBe(30);
  });
  it("requireEnv throws when missing", () => {
    expect(() => requireEnv("DEFINITELY_NOT_SET_VAR")).toThrow();
  });
});
