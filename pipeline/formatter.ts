// pipeline/formatter.ts
import { z } from "zod";

type TaskType = "mcq" | "open";

// Source names vary: some have _V4 suffix (MedExam_V4), some don't (MedMC, CTR-QC, IR-CMeEE).
// Use min(1) rather than a version-suffix regex to accept all real data.
const SubmitItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string(),
  other: z
    .object({
      id: z.number(),
      source: z.string().min(1),
    })
    .passthrough(),
});

export type SubmitItem = z.infer<typeof SubmitItemSchema>;

// Matches a standalone MCQ letter A-E.
// Also handles angle-bracket format <D> used in MedBench task examples.
const MCQ_ANGLE = /<([A-E])>/;
const MCQ_WORD = /\b([A-E])\b/;

export function extractAnswer(rawText: string, taskType: TaskType): string {
  if (taskType === "open") return rawText.trim();
  // Prefer angle-bracket format first (e.g. "答：<D>") — more unambiguous
  const angleMatch = rawText.match(MCQ_ANGLE);
  if (angleMatch) return angleMatch[1];
  const wordMatch = rawText.match(MCQ_WORD);
  return wordMatch ? wordMatch[1] : "";
}

export function validateSubmitItem(item: unknown): SubmitItem {
  return SubmitItemSchema.parse(item);
}
