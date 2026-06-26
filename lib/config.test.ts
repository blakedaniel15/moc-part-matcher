import { describe, it, expect, afterEach } from "vitest";
import { config, requireEnv, dbUrl } from "./config";

describe("config", () => {
  it("defaults model and batch size", () => {
    expect(config.anthropicModel).toBeTruthy();
    expect(config.batchSize).toBe(30);
  });
  it("requireEnv throws when missing", () => {
    expect(() => requireEnv("DEFINITELY_NOT_SET_VAR")).toThrow();
  });
});

describe("dbUrl preview override", () => {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, PREVIEW_DATABASE_URL: process.env.PREVIEW_DATABASE_URL, DATABASE_URL: process.env.DATABASE_URL };
  afterEach(() => {
    process.env.VERCEL_ENV = saved.VERCEL_ENV;
    process.env.PREVIEW_DATABASE_URL = saved.PREVIEW_DATABASE_URL;
    process.env.DATABASE_URL = saved.DATABASE_URL;
  });

  it("uses PREVIEW_DATABASE_URL only on preview deployments", () => {
    process.env.DATABASE_URL = "postgres://prod";
    process.env.PREVIEW_DATABASE_URL = "postgres://preview";

    process.env.VERCEL_ENV = "preview";
    expect(dbUrl()).toBe("postgres://preview");

    process.env.VERCEL_ENV = "production";
    expect(dbUrl()).toBe("postgres://prod");
  });
});
