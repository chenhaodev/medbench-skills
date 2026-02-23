// pipeline/tests/improve.test.ts
import { describe, it, expect } from "vitest";
import { shouldDeploy, hashStrategy, estimateImproveCostUsd } from "../improve";

describe("shouldDeploy", () => {
  it("returns true when new score exceeds current by >0.005", () => {
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.757 })).toBe(true);
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.80 })).toBe(true);
  });

  it("returns false within noise floor (≤0.005)", () => {
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.754 })).toBe(false);
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.75 })).toBe(false);
  });

  it("returns false when new score is worse", () => {
    expect(shouldDeploy({ currentScore: 0.80, newScore: 0.70 })).toBe(false);
  });
});

describe("hashStrategy", () => {
  it("returns 6-char hex hash", () => {
    expect(
      hashStrategy({ systemPrompt: "test", fewShots: [], temperature: 0.1 })
    ).toMatch(/^[0-9a-f]{6}$/);
  });

  it("is consistent", () => {
    const s = { systemPrompt: "test", fewShots: [], temperature: 0.1 };
    expect(hashStrategy(s)).toBe(hashStrategy(s));
  });

  it("differs for different strategies", () => {
    const a = { systemPrompt: "A", fewShots: [], temperature: 0.1 };
    const b = { systemPrompt: "B", fewShots: [], temperature: 0.1 };
    expect(hashStrategy(a)).not.toBe(hashStrategy(b));
  });
});

describe("estimateImproveCostUsd", () => {
  it("returns a positive number for any track", () => {
    expect(estimateImproveCostUsd("LLM", 43)).toBeGreaterThan(0);
    expect(estimateImproveCostUsd("Agent", 30)).toBeGreaterThan(0);
    expect(estimateImproveCostUsd("VLM", 18)).toBeGreaterThan(0);
  });

  it("scales with question count", () => {
    const small = estimateImproveCostUsd("LLM", 10);
    const large = estimateImproveCostUsd("LLM", 100);
    expect(large).toBeGreaterThan(small);
  });
});
