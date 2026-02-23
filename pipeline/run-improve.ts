// pipeline/run-improve.ts
import "dotenv/config";
import fs from "fs/promises";
import { extractTrack, groupBySource } from "./extractor";
import { route } from "./router";
import { evolveStrategy, estimateImproveCostUsd } from "./improve";
import { recordCycleResult } from "../mcp-server/tools/record";
import {
  loadQuestionHistory,
  calibrateWithMedBenchScore,
  computeStability,
} from "./ensemble";

const TOTAL_BUDGET_USD = parseFloat(process.env.MAX_DAILY_COST_USD ?? "6");
// Pipeline cost ~$4.30 after adding temperature sampling + ensemble secondary (~20% of questions).
// Read from env so it can be tuned without code changes.
const PIPELINE_COST_USD = parseFloat(process.env.PIPELINE_COST_USD ?? "4.30");
const IMPROVE_BUDGET_USD = Math.max(0, TOTAL_BUDGET_USD - PIPELINE_COST_USD); // ~$1.70

const MCQ_TASKS = new Set([
  "MedExam",
  "MedSafety",
  "MedEthics",
  "MedRxCheck",
  "MedIntentID",
]);

interface ScoreEntry {
  cycle: number;
  strategyHash: string;
  score: number;
  date: string;
}

interface ScoresDB {
  lastCycle?: number;
  tasks?: Record<string, ScoreEntry[]>;
  [key: string]: unknown; // legacy flat format
}

async function loadLastScores(): Promise<Record<string, number>> {
  try {
    const raw = await fs.readFile("history/scores.json", "utf-8");
    const db = JSON.parse(raw) as ScoresDB;
    const result: Record<string, number> = {};
    // Support both new nested (tasks.{name}) and legacy flat ({name: entries[]}) format
    const taskMap = db.tasks ?? (db as Record<string, ScoreEntry[]>);
    for (const [task, records] of Object.entries(taskMap)) {
      if (
        task === "lastCycle" ||
        !Array.isArray(records) ||
        records.length === 0
      )
        continue;
      result[task] = records[records.length - 1].score;
    }
    return result;
  } catch {
    return {};
  }
}

// Parse --calibrate=MedSafety:0.65,MedExam:0.80 argument
function parseCalibrations(argv: string[]): Record<string, number> {
  const arg = argv.find((a) => a.startsWith("--calibrate="));
  if (!arg) return {};
  const pairs = arg.replace("--calibrate=", "").split(",");
  return Object.fromEntries(
    pairs.map((p) => {
      const [task, score] = p.split(":");
      return [task, parseFloat(score)];
    }),
  );
}

async function main() {
  const cycleArg = process.argv.find((a) => a.startsWith("--cycle="));
  const cycle = cycleArg ? parseInt(cycleArg.split("=")[1]) : 1;
  const calibrations = parseCalibrations(process.argv);

  console.log(`Improvement loop: cycle ${cycle}`);
  console.log(
    `Budget: $${TOTAL_BUDGET_USD} total | ~$${PIPELINE_COST_USD} pipeline | ~$${IMPROVE_BUDGET_USD} improve`,
  );
  if (Object.keys(calibrations).length > 0) {
    console.log(`Calibrating with MedBench scores:`, calibrations);
  }

  const lastScores = await loadLastScores();

  type TaskEntry = {
    taskName: string;
    source: string;
    track: "LLM" | "Agent" | "VLM";
    model: ReturnType<typeof route>["model"];
    items: Awaited<ReturnType<typeof extractTrack>>;
    lastScore: number;
    estimatedCost: number;
  };

  const allTaskEntries: TaskEntry[] = [];

  const onlyTrack = process.env.ONLY_TRACK as
    | "LLM"
    | "Agent"
    | "VLM"
    | undefined;
  const tracks: Array<"LLM" | "Agent" | "VLM"> = onlyTrack
    ? [onlyTrack]
    : ["LLM", "Agent", "VLM"];

  for (const track of tracks) {
    const allItems = await extractTrack(track);
    const grouped = groupBySource(allItems);

    for (const [source, taskItems] of grouped) {
      const { model, taskName } = route(source);
      const lastScore = lastScores[taskName] ?? 0;
      const estimatedCost = estimateImproveCostUsd(track, taskItems.length);
      allTaskEntries.push({
        taskName,
        source,
        track,
        model,
        items: taskItems,
        lastScore,
        estimatedCost,
      });
    }
  }

  // Sort tasks: lowest MedBench score first
  allTaskEntries.sort((a, b) => a.lastScore - b.lastScore);

  console.log("\nTask priority (lowest score first):");
  allTaskEntries.forEach((t) =>
    console.log(
      `  ${t.taskName.padEnd(20)} score=${t.lastScore.toFixed(3)}  est=$${t.estimatedCost.toFixed(2)}`,
    ),
  );

  let budgetSpent = 0;

  for (const entry of allTaskEntries) {
    if (budgetSpent + entry.estimatedCost > IMPROVE_BUDGET_USD) {
      console.log(
        `\n[BUDGET] Skipping ${entry.taskName} ($${budgetSpent.toFixed(2)}/$${IMPROVE_BUDGET_USD} spent)`,
      );
      continue;
    }

    const taskType = MCQ_TASKS.has(entry.taskName) ? "mcq" : "open";
    const questionHistory = await loadQuestionHistory(entry.source);

    // Cold-start guard: if no history exists (cycle 1), skip calibration entirely.
    const hasHistory = Object.keys(questionHistory).length > 0;
    const itemsWithConfidence = entry.items.map((item) => {
      const hist = questionHistory[String(item.other.id)] ?? [];
      if (!hasHistory || hist.length === 0) {
        return { ...item, confidence: 0.5 }; // neutral — no history yet
      }
      const lastConf = hist[hist.length - 1].confidence;
      const stability = computeStability(
        hist.map((h) => ({ cycle: h.cycle, answer: h.answer })),
      );
      // Only apply stability bonus if item was previously marked pseudo-correct.
      const pseudoCorrectCount = hist.filter(
        (h) => (h as { pseudoCorrect?: boolean | null }).pseudoCorrect === true,
      ).length;
      const stabilityBonus = pseudoCorrectCount > 0 ? stability : 1.0;
      return { ...item, confidence: lastConf * stabilityBonus };
    });

    const medBenchScore = calibrations[entry.taskName];

    if (!hasHistory && medBenchScore !== undefined) {
      console.log(
        `  [${entry.taskName}] No question history yet — skipping calibration, improving all questions`,
      );
    }

    // Apply calibration: if MedBench score provided, mark pseudo-correct/wrong
    const calibrated =
      medBenchScore !== undefined
        ? calibrateWithMedBenchScore(
            itemsWithConfidence.map((i) => ({
              id: i.other.id,
              confidence: i.confidence,
              pseudoCorrect: null as boolean | null,
            })),
            medBenchScore,
          )
        : null;

    // Target improvement at pseudo-wrong questions (or all if no calibration yet)
    // Use Map for O(1) lookup instead of O(n²) calibrated.find()
    const calibratedMap = calibrated
      ? new Map(calibrated.map((c) => [c.id, c.pseudoCorrect]))
      : null;
    const targetItems = calibratedMap
      ? entry.items.filter((item) => calibratedMap.get(item.other.id) === false)
      : entry.items; // no calibration yet: improve all

    console.log(
      `\n[${entry.taskName}] score=${entry.lastScore.toFixed(3)} | ${targetItems.length}/${entry.items.length} target questions (pseudo-wrong or uncalibrated)`,
    );

    const result = await evolveStrategy({
      taskName: entry.taskName,
      modelKey: entry.model,
      allItems: targetItems, // only pseudo-wrong questions — focused improvement
      currentScore: entry.lastScore,
      taskType,
    });

    budgetSpent += result.actualCostUsd;
    console.log(
      `  Budget: $${budgetSpent.toFixed(2)} / $${IMPROVE_BUDGET_USD}`,
    );

    if (result.deployed && result.newScore !== null) {
      await recordCycleResult({
        cycleId: cycle,
        task: entry.taskName,
        strategyHash: result.newHash ?? "",
        score: result.newScore,
      });
    }
  }

  console.log(`\nDone. Improvement cost: $${budgetSpent.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
