// pipeline/tests/ensemble.test.ts
import { describe, it, expect } from "vitest";
import {
  computeConfidenceFromSamples,
  dawidskeenEM,
  computeStability,
  calibrateWithMedBenchScore,
} from "../ensemble";

describe("computeConfidenceFromSamples", () => {
  it("returns 1.0 when all samples agree", () => {
    expect(computeConfidenceFromSamples(["A", "A", "A", "A", "A"]).confidence).toBe(1.0);
  });

  it("returns modal answer and its frequency as confidence", () => {
    const result = computeConfidenceFromSamples(["A", "A", "B", "A", "C"]);
    expect(result.answer).toBe("A");
    expect(result.confidence).toBeCloseTo(0.6);
  });

  it("handles tie by returning first modal answer", () => {
    const result = computeConfidenceFromSamples(["A", "B", "A", "B"]);
    expect(["A", "B"]).toContain(result.answer);
    expect(result.confidence).toBe(0.5);
  });
});

describe("dawidskeenEM", () => {
  it("recovers obvious majority answer after 10 iterations", () => {
    // 4 models, 3 questions. Questions 0 and 2 have clear majority.
    const votes = [
      ["A", "A", "A", "B"], // q0: 3×A, 1×B → true label A
      ["B", "C", "A", "D"], // q1: all disagree → uncertain
      ["C", "C", "C", "C"], // q2: unanimous C → true label C
    ];
    const result = dawidskeenEM(votes, ["A", "B", "C", "D", "E"]);
    expect(result.trueLabels[0]).toBe("A");
    expect(result.trueLabels[2]).toBe("C");
  });

  it("returns confidence array summing to 1 per question", () => {
    const votes = [["A", "A", "B", "A"]];
    const result = dawidskeenEM(votes, ["A", "B", "C", "D", "E"]);
    const sum = Object.values(result.labelProbs[0]).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});

describe("computeStability", () => {
  it("returns 1.0 when all cycles have same answer", () => {
    const history = [
      { cycle: 1, answer: "B" },
      { cycle: 2, answer: "B" },
      { cycle: 3, answer: "B" },
    ];
    expect(computeStability(history)).toBe(1.0);
  });

  it("returns fraction of matching answers", () => {
    const history = [
      { cycle: 1, answer: "B" },
      { cycle: 2, answer: "C" },
      { cycle: 3, answer: "B" },
      { cycle: 4, answer: "B" },
    ];
    expect(computeStability(history)).toBeCloseTo(0.75);
  });

  it("returns 1.0 for single-cycle history", () => {
    expect(computeStability([{ cycle: 1, answer: "A" }])).toBe(1.0);
  });
});

describe("calibrateWithMedBenchScore", () => {
  it("marks top-fraction items as pseudoCorrect=true", () => {
    // Task score=0.6 → top 60% by confidence = pseudo-correct
    const items = [
      { id: 1, confidence: 0.95, pseudoCorrect: null },
      { id: 2, confidence: 0.80, pseudoCorrect: null },
      { id: 3, confidence: 0.70, pseudoCorrect: null },
      { id: 4, confidence: 0.55, pseudoCorrect: null },
      { id: 5, confidence: 0.30, pseudoCorrect: null },
    ];
    const calibrated = calibrateWithMedBenchScore(items, 0.6);
    expect(calibrated[0].pseudoCorrect).toBe(true); // rank 1 of 5 → top 60%
    expect(calibrated[1].pseudoCorrect).toBe(true); // rank 2 of 5 → top 60%
    expect(calibrated[2].pseudoCorrect).toBe(true); // rank 3 of 5 → top 60%
    expect(calibrated[3].pseudoCorrect).toBe(false); // rank 4 of 5 → bottom 40%
    expect(calibrated[4].pseudoCorrect).toBe(false); // rank 5 of 5 → bottom 40%
  });
});
