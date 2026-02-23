// mcp-server/tests/mcp.test.ts
import { describe, it, expect } from "vitest";
import { routeQuestion } from "../tools/route";
import { recordCycleResult } from "../tools/record";

describe("routeQuestion", () => {
  it("returns model and apiKeyEnv for known source", () => {
    const r = routeQuestion({ taskSource: "MedSafety_V4", question: "Is X safe?" });
    expect(r.model).toBe("qwen");
    expect(r.apiKeyEnv).toBe("QWEN_API_KEY");
    expect(r.track).toBe("LLM");
  });

  it("throws for unknown source", () => {
    expect(() => routeQuestion({ taskSource: "Unknown_V4", question: "Q?" })).toThrow();
  });
});

describe("recordCycleResult", () => {
  it("writes without error", async () => {
    await expect(
      recordCycleResult({
        cycleId: 99,
        task: "MedSafety",
        strategyHash: "test",
        score: 0.75,
        _testOutputPath: "/tmp/medbench-test-scores.json",
      })
    ).resolves.not.toThrow();
  });
});
