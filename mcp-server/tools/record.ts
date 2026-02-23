// mcp-server/tools/record.ts
import fs from "fs/promises";
import path from "path";

const DEFAULT_SCORES_PATH = path.resolve("history/scores.json");

type ScoreEntry = {
  cycle: number;
  strategyHash: string;
  score: number;
  date: string;
};

interface ScoresDB {
  lastCycle?: number;
  tasks: Record<string, ScoreEntry[]>;
}

function parseDB(raw: string): ScoresDB {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const lastCycle =
    typeof parsed.lastCycle === "number" ? parsed.lastCycle : undefined;
  const tasks = (
    typeof parsed.tasks === "object" && parsed.tasks !== null
      ? parsed.tasks
      : {}
  ) as Record<string, ScoreEntry[]>;
  return { lastCycle, tasks };
}

export async function recordCycleResult(input: {
  cycleId: number;
  task: string;
  strategyHash: string;
  score: number;
  _testOutputPath?: string;
}): Promise<void> {
  const filePath = input._testOutputPath ?? DEFAULT_SCORES_PATH;
  let db: ScoresDB = { tasks: {} };
  try {
    db = parseDB(await fs.readFile(filePath, "utf-8"));
  } catch {
    /* first run */
  }

  const existing = db.tasks[input.task] ?? [];
  const updated: ScoresDB = {
    lastCycle: input.cycleId,
    tasks: {
      ...db.tasks,
      [input.task]: [
        ...existing,
        {
          cycle: input.cycleId,
          strategyHash: input.strategyHash,
          score: input.score,
          date: new Date().toISOString().split("T")[0],
        },
      ],
    },
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
}

export async function getBestStrategy(
  task: string
): Promise<ScoreEntry | null> {
  try {
    const db = parseDB(await fs.readFile(DEFAULT_SCORES_PATH, "utf-8"));
    const records = db.tasks[task] ?? [];
    if (records.length === 0) return null;
    return records.reduce((best: ScoreEntry, r: ScoreEntry) =>
      r.score > best.score ? r : best
    );
  } catch {
    return null;
  }
}
