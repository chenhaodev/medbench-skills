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
import {
  temperatureSample,
  dawidskeenEM,
  getSecondaryModels,
  MCQ_CLASSES,
  saveQuestionRecord,
} from "./ensemble";

const MAX_COST = parseFloat(process.env.MAX_DAILY_COST_USD ?? "6");

const ENSEMBLE_CONFIDENCE_THRESHOLD = 0.7; // below this → run secondary models
const TEMP_SAMPLE_COUNT = 5; // draws per question for confidence estimate

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

      // Temperature sampling → empirical confidence
      const tempResult = await temperatureSample(
        client,
        prompt,
        strategy.systemPrompt,
        taskType,
        TEMP_SAMPLE_COUNT,
        0.7,
      );

      let finalAnswer = tempResult.answer;
      let finalConfidence = tempResult.confidence;
      let allModelAnswers: Record<string, string> | null = null;
      let ensembleAnswer: string | null = null;
      let tokensUsed = 0;

      // Low-confidence: run secondary models + Dawid-Skene
      if (
        tempResult.confidence < ENSEMBLE_CONFIDENCE_THRESHOLD &&
        taskType === "mcq"
      ) {
        const secondaryModels = getSecondaryModels(routeResult.model);
        const secondaryAnswers: string[] = [];
        for (const modelKey of secondaryModels) {
          let secClient;
          try {
            secClient = getClient(modelKey);
          } catch {
            continue; // skip unavailable secondary
          }
          const secResp = await secClient.answer({
            prompt,
            systemPrompt: strategy.systemPrompt,
          });
          secondaryAnswers.push(extractAnswer(secResp.text, taskType));
          tokensUsed += secResp.tokensUsed;
        }

        const votes = [tempResult.answer, ...secondaryAnswers];
        allModelAnswers = Object.fromEntries(
          [
            routeResult.model,
            ...secondaryModels.slice(0, secondaryAnswers.length),
          ].map((m, i) => [m, votes[i]]),
        );

        if (votes.length > 1) {
          const dsResult = dawidskeenEM([votes], MCQ_CLASSES);
          ensembleAnswer = dsResult.trueLabels[0] ?? tempResult.answer;
          finalAnswer = ensembleAnswer;
          finalConfidence =
            dsResult.labelProbs[0][ensembleAnswer] ?? tempResult.confidence;
        }
      }

      const answer =
        finalAnswer || extractAnswer(tempResult.samples[0] ?? "", taskType);
      const submitItem = validateSubmitItem({
        question: item.question,
        answer,
        other: item.other,
      });
      submitItems.push(submitItem);

      // REQUIRED: persist question record so run-improve.ts can read history next cycle
      await saveQuestionRecord(item.other.source, item.other.id, {
        cycle,
        answer,
        confidence: finalConfidence,
        ensembleAnswer,
        pseudoCorrect: null, // set post-hoc by run-improve.ts after MedBench score arrives
      });

      enrichedItems.push({
        id: item.other.id,
        source: item.other.source,
        answer,
        confidence: finalConfidence,
        model: routeResult.model,
        strategy: strategy.hash,
        strategyHash: strategy.hash,
        judgeScore: null,
        tokensUsed,
        latencyMs: 0,
        cycle,
        ensembleAnswer,
        allModelAnswers,
        temperatureSamples: tempResult.samples,
        answerStability: 1.0,
        pseudoCorrect: null,
      });

      // Blended cost estimate: $0.002 per 1K tokens
      costUsd += (tokensUsed / 1000) * 0.002;
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

  const VALID_TRACKS = ["LLM", "Agent", "VLM"] as const;
  const rawOnlyTrack = process.env.ONLY_TRACK;
  if (
    rawOnlyTrack !== undefined &&
    !(VALID_TRACKS as readonly string[]).includes(rawOnlyTrack)
  ) {
    console.error(
      `[ERROR] Invalid ONLY_TRACK="${rawOnlyTrack}". Valid values: ${VALID_TRACKS.join(", ")}`,
    );
    process.exit(1);
  }
  const onlyTrack = rawOnlyTrack as (typeof VALID_TRACKS)[number] | undefined;
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
