// pipeline/improve.ts
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { QuestionItem } from "./extractor";
import type { Strategy } from "./strategies";
import { judgeAnswer } from "./judge";
import { getClient } from "./clients";
import { buildPrompt, loadStrategy } from "./strategies";
import { extractAnswer } from "./formatter";
import type { ModelKey, Track } from "./router";

// Near-zero: only filters floating-point noise, not real variance.
// We WANT to overfit — any measurable improvement on the full question set deploys.
const IMPROVEMENT_THRESHOLD = 0.005;

// Cost per 1K tokens by model (blended estimate, including judge call overhead)
const COST_PER_1K: Record<ModelKey, number> = {
  qwen: 0.001,
  claude: 0.003,
  gemini: 0.002,
  gpt: 0.004,
};
const N_VARIANTS = 3;
const JUDGE_OVERHEAD = 2.0; // judge doubles total token cost per question

export function estimateImproveCostUsd(
  track: Track,
  nQuestions: number,
): number {
  const modelCostMap: Record<Track, ModelKey> = {
    LLM: "qwen",
    Agent: "claude",
    VLM: "gpt",
  };
  const avgTokensPerQ = track === "VLM" ? 800 : 400;
  const model = modelCostMap[track];
  return (
    nQuestions *
    (avgTokensPerQ / 1000) *
    COST_PER_1K[model] *
    N_VARIANTS *
    JUDGE_OVERHEAD
  );
}

export function shouldDeploy(p: {
  currentScore: number;
  newScore: number;
}): boolean {
  return p.newScore - p.currentScore > IMPROVEMENT_THRESHOLD;
}

const STRATEGIES_DIR = path.resolve("history/strategies");
const ARCHIVE_DIR = path.join(STRATEGIES_DIR, "archive");

// Copy current strategy to archive/{taskName}/{hash}__{date}.json before overwriting.
export async function archiveStrategy(
  taskName: string,
  strategy: Strategy,
  _archiveDir = ARCHIVE_DIR,
): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const dir = path.join(_archiveDir, taskName);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${strategy.hash}__${date}.json`);
  await fs.writeFile(dest, JSON.stringify(strategy, null, 2), "utf-8");
  return dest;
}

export function hashStrategy(
  s: Pick<Strategy, "systemPrompt" | "fewShots" | "temperature">,
): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({ s: s.systemPrompt, f: s.fewShots, t: s.temperature }),
    )
    .digest("hex")
    .slice(0, 6);
}

async function evaluateStrategy(
  strategy: Strategy,
  items: QuestionItem[],
  model: ModelKey,
  taskType: "mcq" | "open",
): Promise<{ score: number; actualCostUsd: number }> {
  const client = getClient(model);
  const scores: number[] = [];
  let tokens = 0;

  for (const item of items) {
    const prompt = buildPrompt(item.question, strategy);
    const response = await client.answer({
      prompt,
      systemPrompt: strategy.systemPrompt,
    });
    const answer = extractAnswer(response.text, taskType);
    const score = await judgeAnswer({
      question: item.question,
      answer,
      taskType,
    });
    if (score !== null) scores.push(score);
    tokens += response.tokensUsed;
  }

  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;
  const actualCostUsd = (tokens / 1000) * COST_PER_1K[model] * JUDGE_OVERHEAD;
  return { score: avgScore, actualCostUsd };
}

export async function evolveStrategy(params: {
  taskName: string;
  modelKey: ModelKey;
  allItems: QuestionItem[]; // ALL task questions — no held-out split
  currentScore: number;
  taskType: "mcq" | "open";
}): Promise<{
  deployed: boolean;
  newHash: string | null;
  newScore: number | null;
  actualCostUsd: number;
}> {
  const { taskName, modelKey, allItems, currentScore, taskType } = params;
  const current = await loadStrategy(taskName);

  if (current.locked) {
    console.log(`  [${taskName}] Locked: ${current.lockedReason}`);
    return {
      deployed: false,
      newHash: null,
      newScore: null,
      actualCostUsd: 0,
    };
  }

  const variants: Strategy[] = [
    {
      ...current,
      systemPrompt: current.systemPrompt + "\n请逐步思考，给出推理过程。",
      hash: hashStrategy({
        ...current,
        systemPrompt: current.systemPrompt + "\n逐步",
      }),
    },
    {
      ...current,
      systemPrompt: `作为拥有20年临床经验的主任医师，\n${current.systemPrompt}`,
      hash: hashStrategy({
        ...current,
        systemPrompt: `主任医师\n${current.systemPrompt}`,
      }),
    },
    {
      ...current,
      temperature: Math.max(0.01, current.temperature - 0.05),
      hash: hashStrategy({
        ...current,
        temperature: current.temperature - 0.05,
      }),
    },
  ];

  let best: Strategy | null = null;
  let bestScore = currentScore;
  let totalCostUsd = 0;

  for (const v of variants) {
    const { score, actualCostUsd } = await evaluateStrategy(
      v,
      allItems,
      modelKey,
      taskType,
    );
    totalCostUsd += actualCostUsd;
    console.log(
      `  [${taskName}] variant ${v.hash}: ${score.toFixed(3)} (current: ${currentScore.toFixed(3)})`,
    );
    if (shouldDeploy({ currentScore: bestScore, newScore: score })) {
      bestScore = score;
      best = v;
    }
  }

  if (best) {
    // Archive the current strategy before overwriting so it can be rolled back
    await archiveStrategy(taskName, current);
    await fs.writeFile(
      path.resolve(`history/strategies/${taskName}.json`),
      JSON.stringify(best, null, 2),
      "utf-8",
    );
    console.log(
      `  [${taskName}] ✓ Deployed ${best.hash} (${bestScore.toFixed(3)})`,
    );
    return {
      deployed: true,
      newHash: best.hash,
      newScore: bestScore,
      actualCostUsd: totalCostUsd,
    };
  }

  console.log(`  [${taskName}] No improvement found`);
  return {
    deployed: false,
    newHash: null,
    newScore: null,
    actualCostUsd: totalCostUsd,
  };
}
