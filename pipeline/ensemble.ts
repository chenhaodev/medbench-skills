// pipeline/ensemble.ts
import fs from "fs/promises";
import path from "path";
import type { ApiClient } from "./clients";
import type { ModelKey } from "./router";

// ─── Temperature Sampling ────────────────────────────────────────────────────

interface SampleResult {
  answer: string;
  confidence: number; // fraction of samples matching modal answer
  samples: string[]; // raw draws e.g. ['A','A','B','A','A']
}

// Run the same question N times at high temperature; return modal answer + empirical confidence.
// This is model-agnostic: works without logprob access.
export async function temperatureSample(
  client: ApiClient,
  prompt: string,
  systemPrompt: string,
  taskType: "mcq" | "open",
  nSamples = 5,
  temperature = 0.7,
): Promise<SampleResult> {
  const rawResults: string[] = [];
  for (let i = 0; i < nSamples; i++) {
    const resp = await client.answer({ prompt, systemPrompt, temperature });
    rawResults.push(
      taskType === "mcq"
        ? (resp.text.match(/\b([A-E])\b/)?.[1] ?? "")
        : resp.text.trim(),
    );
  }
  return computeConfidenceFromSamples(rawResults);
}

export function computeConfidenceFromSamples(samples: string[]): SampleResult {
  if (samples.length === 0) return { answer: "", confidence: 0, samples: [] };

  const freq = new Map<string, number>();
  for (const s of samples) freq.set(s, (freq.get(s) ?? 0) + 1);

  let modalAnswer = "";
  let modalCount = 0;
  for (const [ans, count] of freq) {
    if (count > modalCount) {
      modalAnswer = ans;
      modalCount = count;
    }
  }

  return {
    answer: modalAnswer,
    confidence: modalCount / samples.length,
    samples,
  };
}

// ─── Dawid-Skene EM ──────────────────────────────────────────────────────────

interface DawidskeenResult {
  trueLabels: string[]; // MAP label per question
  labelProbs: Record<string, number>[]; // full probability dist per question
  modelAccuracy: Record<string, number>[]; // per-model accuracy per class (diagnostic)
}

// Simplified Dawid-Skene EM for MCQ.
// votes[i][j] = answer model j gave to question i.
// classes = all possible answer choices (e.g. ['A','B','C','D','E'])
export function dawidskeenEM(
  votes: string[][],
  classes: string[],
  maxIter = 20,
): DawidskeenResult {
  const nQ = votes.length;
  const nM = votes[0]?.length ?? 0;
  const nC = classes.length;
  const classIdx = Object.fromEntries(classes.map((c, i) => [c, i]));

  // Initialize with raw vote counts (breaks symmetry so EM converges quickly)
  let probs: number[][] = votes.map((vRow) => {
    const init = Array<number>(nC).fill(1e-6); // Laplace floor
    for (const v of vRow) {
      const idx = classIdx[v];
      if (idx !== undefined) init[idx] += 1;
    }
    const total = init.reduce((a, b) => a + b, 0);
    return init.map((x) => x / total);
  });

  for (let iter = 0; iter < maxIter; iter++) {
    // M-step: estimate per-model confusion matrices
    // confMatrix[m][true_c][obs_c] = P(model m says obs_c | true = true_c)
    const confMatrix: number[][][] = Array.from(
      { length: nM },
      () => Array.from({ length: nC }, () => Array<number>(nC).fill(1e-6)), // Laplace smoothing
    );
    for (let i = 0; i < nQ; i++) {
      for (let m = 0; m < nM; m++) {
        const obsC = classIdx[votes[i][m]];
        if (obsC === undefined) continue;
        for (let c = 0; c < nC; c++) {
          confMatrix[m][c][obsC] += probs[i][c];
        }
      }
    }
    // Normalize rows
    for (let m = 0; m < nM; m++) {
      for (let c = 0; c < nC; c++) {
        const rowSum = confMatrix[m][c].reduce((a, b) => a + b, 0);
        for (let obsC = 0; obsC < nC; obsC++) confMatrix[m][c][obsC] /= rowSum;
      }
    }

    // E-step: update posterior P(true_c | votes_i)
    const newProbs: number[][] = [];
    for (let i = 0; i < nQ; i++) {
      const post = Array<number>(nC).fill(1 / nC); // prior
      for (let c = 0; c < nC; c++) {
        for (let m = 0; m < nM; m++) {
          const obsC = classIdx[votes[i][m]];
          if (obsC !== undefined) post[c] *= confMatrix[m][c][obsC];
        }
      }
      const Z = post.reduce((a, b) => a + b, 0);
      newProbs.push(
        Z > 0 ? post.map((p) => p / Z) : Array<number>(nC).fill(1 / nC),
      );
    }
    probs = newProbs;
  }

  const trueLabels = probs.map(
    (p) => classes[p.indexOf(Math.max(...p))] ?? classes[0],
  );
  const labelProbs = probs.map((p) =>
    Object.fromEntries(classes.map((c, i) => [c, p[i]])),
  );
  // Simplified accuracy: diagonal of confMatrix averaged across questions (diagnostic only)
  const modelAccuracy = Array.from(
    { length: nM },
    () => Object.fromEntries(classes.map((c) => [c, 0.8])), // placeholder
  );

  return { trueLabels, labelProbs, modelAccuracy };
}

// ─── Secondary Model Selection ───────────────────────────────────────────────

// Returns one cheap secondary model for cross-validation.
// One secondary only (not two) to control cost.
export function getSecondaryModels(primary: ModelKey): ModelKey[] {
  const secondaryMap: Record<ModelKey, ModelKey> = {
    qwen: "claude", // LLM track: Claude as secondary
    claude: "gemini", // Agent track: Gemini as secondary
    gemini: "claude", // Agent/VLM: Claude as secondary
    gpt: "gemini", // VLM track: Gemini as secondary
  };
  return [secondaryMap[primary]];
}

export const MCQ_CLASSES = ["A", "B", "C", "D", "E"];

// ─── Per-Question History ────────────────────────────────────────────────────

const QUESTIONS_DIR = path.resolve("history/questions");

interface QuestionRecord {
  cycle: number;
  answer: string;
  confidence: number;
  ensembleAnswer: string | null;
  pseudoCorrect: boolean | null; // set post-hoc via calibrateWithMedBenchScore; null until MedBench score arrives
}

type QuestionHistory = Record<string, QuestionRecord[]>; // key = question id as string

export async function loadQuestionHistory(
  taskSource: string,
): Promise<QuestionHistory> {
  const taskName = taskSource.replace(/_[Vv]\d+.*$/, "");
  try {
    const raw = await fs.readFile(
      path.join(QUESTIONS_DIR, `${taskName}.json`),
      "utf-8",
    );
    return JSON.parse(raw) as QuestionHistory;
  } catch {
    return {};
  }
}

export async function saveQuestionRecord(
  taskSource: string,
  questionId: number,
  record: QuestionRecord,
): Promise<void> {
  const taskName = taskSource.replace(/_[Vv]\d+.*$/, "");
  const filePath = path.join(QUESTIONS_DIR, `${taskName}.json`);
  const history = await loadQuestionHistory(taskSource);
  const key = String(questionId);
  const updated: QuestionHistory = {
    ...history,
    [key]: [...(history[key] ?? []), record],
  };
  await fs.mkdir(QUESTIONS_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
}

// ─── Stability ───────────────────────────────────────────────────────────────

export function computeStability(
  history: Array<{ cycle: number; answer: string }>,
): number {
  if (history.length <= 1) return 1.0;
  const modal = computeConfidenceFromSamples(history.map((h) => h.answer));
  return modal.confidence;
}

// ─── MedBench Score Calibration ──────────────────────────────────────────────

interface ConfidenceItem {
  id: number;
  confidence: number;
  pseudoCorrect: boolean | null;
}

// After receiving MedBench aggregate score for a task, mark top-fraction items as pseudo-correct.
// The top `score` fraction by confidence = the ones we most likely got right.
export function calibrateWithMedBenchScore<T extends ConfidenceItem>(
  items: T[],
  medBenchScore: number, // 0-1 fraction of questions answered correctly
): T[] {
  const sorted = [...items].sort((a, b) => b.confidence - a.confidence);
  const nCorrect = Math.round(medBenchScore * items.length);
  return sorted.map((item, idx) => ({
    ...item,
    pseudoCorrect: idx < nCorrect,
  }));
}
