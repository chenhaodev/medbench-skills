// pipeline/tests/judge.test.ts
import { describe, it, expect } from "vitest";
import { buildJudgePrompt, parseJudgeResponse } from "../judge";

describe("buildJudgePrompt", () => {
  it("includes the question and answer", () => {
    const p = buildJudgePrompt({ question: "What is X?", answer: "X is Y", taskType: "open" });
    expect(p).toContain("What is X?");
    expect(p).toContain("X is Y");
    expect(p).toContain("医学专家");
  });
});

describe("parseJudgeResponse", () => {
  it("extracts score from JSON", () => {
    expect(parseJudgeResponse('{"score": 0.85, "reasoning": "OK"}')).toBeCloseTo(0.85);
  });

  it("extracts score from markdown block", () => {
    expect(
      parseJudgeResponse('```json\n{"score": 0.7, "reasoning": "OK"}\n```')
    ).toBeCloseTo(0.7);
  });

  it("returns null for unparseable response", () => {
    expect(parseJudgeResponse("I cannot judge")).toBeNull();
  });

  it("clamps to 0-1", () => {
    expect(parseJudgeResponse('{"score": 1.5, "reasoning": ""}')).toBe(1.0);
    expect(parseJudgeResponse('{"score": -0.1, "reasoning": ""}')).toBe(0.0);
  });
});
