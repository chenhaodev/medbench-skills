// pipeline/output.ts
import fs from "fs/promises";
import path from "path";
import type { SubmitItem } from "./formatter";

export interface EnrichedItem {
  id: number;
  source: string;
  answer: string; // final submitted answer (ensemble MAP or primary model)
  confidence: number; // 0-1: from temperature sampling or ensemble agreement
  model: string; // primary route-assigned model
  strategy: string;
  strategyHash: string;
  judgeScore: number | null;
  tokensUsed: number;
  latencyMs: number;
  cycle: number;
  // Ensemble / ground-truth inference fields
  ensembleAnswer: string | null; // Dawid-Skene MAP estimate (null = single model used)
  allModelAnswers: Record<string, string> | null; // {qwen:'A', claude:'B'} when multi-model run
  temperatureSamples: string[] | null; // repeated draws e.g. ['A','A','B','A','A'] at T=0.7
  answerStability: number; // fraction of last N cycles with same final answer (0-1)
  pseudoCorrect: boolean | null; // calibration label: set after MedBench score received
}

interface CycleReport {
  cycle: number;
  date: string;
  submittedTracks: string[];
  apiCostUsd: number;
  scores: Record<
    string,
    { score: number; delta: number | null; model: string }
  >;
  trackAverages: Record<string, { score: number; delta: number | null }>;
  weakestTasks: string[];
  improvementPlan: Array<{
    task: string;
    priority: number;
    currentScore: number;
    leaderboardCeiling: number;
    proposedChanges: string[];
  }>;
  nextCycle: number;
}

export async function writeSubmitFile(
  items: SubmitItem[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const lines = items.map((item) =>
    JSON.stringify({
      question: item.question,
      answer: item.answer,
      other: item.other,
    }),
  );
  await fs.writeFile(outputPath, lines.join("\n") + "\n", "utf-8");
}

export async function writeEnrichedFile(
  items: EnrichedItem[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const lines = items.map((item) => JSON.stringify(item));
  await fs.writeFile(outputPath, lines.join("\n") + "\n", "utf-8");
}

export async function writeCycleReport(
  report: CycleReport,
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
}

export function cycleDir(cycleId: number): string {
  return path.resolve(`results/cycle_${cycleId}`);
}
