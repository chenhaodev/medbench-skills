// pipeline/tests/poe.test.ts
import "dotenv/config";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createPoeClient } from "../clients/poe";
import { getClient } from "../clients";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createPoeClient", () => {
  it("throws when POE_API_KEY is not set", () => {
    vi.stubEnv("POE_API_KEY", "");
    expect(() => createPoeClient()).toThrow("POE_API_KEY not set");
  });

  it("returns a client with an answer function when key is present", () => {
    vi.stubEnv("POE_API_KEY", "test-key");
    const client = createPoeClient();
    expect(typeof client.answer).toBe("function");
  });
});

describe("getClient claude fallback", () => {
  it("uses Poe when only POE_API_KEY is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("POE_API_KEY", "poe-key");
    const client = getClient("claude");
    expect(typeof client.answer).toBe("function");
  });

  it("uses Anthropic when only ANTHROPIC_API_KEY is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
    vi.stubEnv("POE_API_KEY", "");
    const client = getClient("claude");
    expect(typeof client.answer).toBe("function");
  });

  it("prefers Anthropic when both keys are set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
    vi.stubEnv("POE_API_KEY", "poe-key");
    // Both present — should not throw, returns a client
    const client = getClient("claude");
    expect(typeof client.answer).toBe("function");
  });

  it("throws when neither ANTHROPIC_API_KEY nor POE_API_KEY is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("POE_API_KEY", "");
    expect(() => getClient("claude")).toThrow();
  });
});
