// pipeline/tests/improve.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  shouldDeploy,
  hashStrategy,
  estimateImproveCostUsd,
  archiveStrategy,
} from "../improve";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "medbench-archive-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

describe("shouldDeploy", () => {
  it("returns true when new score exceeds current by >0.005", () => {
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.757 })).toBe(true);
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.8 })).toBe(true);
  });

  it("returns false within noise floor (≤0.005)", () => {
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.754 })).toBe(false);
    expect(shouldDeploy({ currentScore: 0.75, newScore: 0.75 })).toBe(false);
  });

  it("returns false when new score is worse", () => {
    expect(shouldDeploy({ currentScore: 0.8, newScore: 0.7 })).toBe(false);
  });
});

describe("hashStrategy", () => {
  it("returns 6-char hex hash", () => {
    expect(
      hashStrategy({ systemPrompt: "test", fewShots: [], temperature: 0.1 }),
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

describe("archiveStrategy", () => {
  const strategy = {
    systemPrompt: "You are a doctor.",
    fewShots: [],
    temperature: 0.1,
    hash: "abc123",
  };

  it("writes archive file under taskName subdirectory", async () => {
    const dest = await archiveStrategy("MedExam", strategy, tmpDir);
    await expect(fs.access(dest)).resolves.toBeUndefined();
  });

  it("archive filename contains the strategy hash", async () => {
    const dest = await archiveStrategy("MedExam", strategy, tmpDir);
    expect(path.basename(dest)).toMatch(/^abc123__/);
  });

  it("archive file contains the full strategy JSON", async () => {
    const dest = await archiveStrategy("MedSafety", strategy, tmpDir);
    const saved = JSON.parse(await fs.readFile(dest, "utf-8"));
    expect(saved.hash).toBe("abc123");
    expect(saved.systemPrompt).toBe("You are a doctor.");
  });

  it("creates separate subdirectories per taskName", async () => {
    await archiveStrategy("MedExam", strategy, tmpDir);
    await archiveStrategy("MedSafety", { ...strategy, hash: "def456" }, tmpDir);
    const entries = await fs.readdir(tmpDir);
    expect(entries).toContain("MedExam");
    expect(entries).toContain("MedSafety");
  });
});
