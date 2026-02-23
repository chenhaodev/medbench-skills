// pipeline/run.ts
import "dotenv/config";
import path from "path";
import fs from "fs/promises";
import { extractTrack, groupBySource } from "./extractor";
import { route } from "./router";
import { getClient } from "./clients";
import { loadStrategy, buildPrompt } from "./strategies";
import { extractAnswer, validateSubmitItem } from "./formatter";
import {
  writeSubmitFile,
  writeEnrichedFile,
  writeCycleReport,
  cycleDir,
  type EnrichedItem,
} from "./output";
import type { SubmitItem } from "./formatter";

const MAX_COST = parseFloat(process.env.MAX_DAILY_COST_USD ?? "6");

// Source names that map to MCQ task type (direct answer A/B/C/D/E)
const MCQ_SOURCE_PREFIXES = new Set([
  "MedExam",
  "MedSafety",
  "MedEthics",
  "MedRxCheck",
  "MedIntentID",
]);

async function getCurrentCycle(): Promise<number> {
  try {
    const data = JSON.parse(await fs.readFile("history/scores.json", "utf-8"));
    return (data.lastCycle ?? 0) + 1;
  } catch {
    return 1;
  }
}

function inferTaskType(source: string): "mcq" | "open" {
  const name = source.replace(/_[Vv]\d+.*$/, "");
  return MCQ_SOURCE_PREFIXES.has(name) ? "mcq" : "open";
}

async function processTrack(
  track: "LLM" | "Agent" | "VLM",
  cycle: number,
): Promise<{
  submitItems: SubmitItem[];
  enrichedItems: EnrichedItem[];
  costUsd: number;
}> {
  console.log(`\n[${track}] Extracting...`);
  const allItems = await extractTrack(track);
  const grouped = groupBySource(allItems);

  const submitItems: SubmitItem[] = [];
  const enrichedItems: EnrichedItem[] = [];
  let costUsd = 0;

  for (const [source, items] of grouped) {
    const routeResult = route(source);
    const strategy = await loadStrategy(routeResult.taskName);
    const taskType = inferTaskType(source);

    let client;
    try {
      client = getClient(routeResult.model);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [${source}] SKIP — client unavailable: ${msg}`);
      continue;
    }

    console.log(
      `  [${source}] → ${routeResult.model} (${items.length} questions)`,
    );

    for (const item of items) {
      const prompt = buildPrompt(item.question, strategy);
      const response = await client.answer({
        prompt,
        systemPrompt: strategy.systemPrompt,
        temperature: strategy.temperature,
      });
      const answer = extractAnswer(response.text, taskType);

      const submitItem = validateSubmitItem({
        question: item.question,
        answer,
        other: item.other,
      });
      submitItems.push(submitItem);

      enrichedItems.push({
        id: item.other.id,
        source: item.other.source,
        answer,
        confidence: response.confidence,
        model: routeResult.model,
        strategy: strategy.hash,
        strategyHash: strategy.hash,
        judgeScore: null,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
        cycle,
        // Ensemble fields — populated in Task 10 (ensemble module)
        ensembleAnswer: null,
        allModelAnswers: null,
        temperatureSamples: null,
        answerStability: 1.0,
        pseudoCorrect: null,
      });

      // Blended cost estimate: $0.002 per 1K tokens
      costUsd += (response.tokensUsed / 1000) * 0.002;
    }
  }

  return { submitItems, enrichedItems, costUsd };
}

async function main() {
  console.log("MedBench Pipeline Starting...");
  const cycle = await getCurrentCycle();
  console.log(`Cycle: ${cycle} | Cost guard: $${MAX_COST}`);

  const dir = cycleDir(cycle);
  await fs.mkdir(path.join(dir, "submit"), { recursive: true });
  await fs.mkdir(path.join(dir, "enriched"), { recursive: true });

  const onlyTrack = process.env.ONLY_TRACK as
    | "LLM"
    | "Agent"
    | "VLM"
    | undefined;
  const tracks: Array<"LLM" | "Agent" | "VLM"> = onlyTrack
    ? [onlyTrack]
    : ["LLM", "Agent", "VLM"];

  let totalCost = 0;

  for (const track of tracks) {
    const { submitItems, enrichedItems, costUsd } = await processTrack(
      track,
      cycle,
    );
    totalCost += costUsd;

    if (totalCost > MAX_COST) {
      console.error(
        `ABORT: Cost $${totalCost.toFixed(2)} exceeds guard $${MAX_COST}`,
      );
      process.exit(1);
    }

    await writeSubmitFile(
      submitItems,
      path.join(dir, "submit", `${track}_submit.jsonl`),
    );
    await writeEnrichedFile(
      enrichedItems,
      path.join(dir, "enriched", `${track}_enriched.jsonl`),
    );
    console.log(
      `[${track}] Done: ${submitItems.length} submit + ${enrichedItems.length} enriched`,
    );
  }

  await writeCycleReport(
    {
      cycle,
      date: new Date().toISOString().split("T")[0],
      submittedTracks: tracks,
      apiCostUsd: totalCost,
      scores: {},
      trackAverages: {},
      weakestTasks: [],
      improvementPlan: [],
      nextCycle: cycle + 1,
    },
    path.join(dir, "report.json"),
  );

  console.log(
    `\nCycle ${cycle} complete. Total cost: $${totalCost.toFixed(2)}`,
  );
  console.log(`Submit: ${dir}/submit/ — Upload these to MedBench`);
  console.log(`Enriched: ${dir}/enriched/ — Internal metadata only`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
