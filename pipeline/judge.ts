// pipeline/judge.ts
import { createQwenClient } from "./clients/qwen";

interface JudgeInput {
  question: string;
  answer: string;
  taskType: "open" | "mcq";
}

export function buildJudgePrompt({ question, answer, taskType }: JudgeInput): string {
  if (taskType === "mcq") {
    return `问题：${question}\n答案：${answer}\n验证答案格式是否为单个大写字母（A-E）。以JSON格式回复：{"score": 0或1, "reasoning": "..."}`;
  }
  return `你是一位资深中国医学专家，正在评估AI生成的医疗回答。

问题：${question}
AI回答：${answer}

请从三个维度评分（0-1分）：临床准确性(0.4) + 推理完整性(0.3) + 格式规范性(0.3)
以JSON格式回复：{"score": 0.0-1.0, "reasoning": "简短说明"}`;
}

export function parseJudgeResponse(raw: string): number | null {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { score?: unknown };
    if (typeof parsed.score !== "number") return null;
    return Math.min(1.0, Math.max(0.0, parsed.score));
  } catch {
    const match = cleaned.match(/"score"\s*:\s*([\d.]+)/);
    if (!match) return null;
    const score = parseFloat(match[1]);
    return isNaN(score) ? null : Math.min(1.0, Math.max(0.0, score));
  }
}

export async function judgeAnswer(input: JudgeInput): Promise<number | null> {
  const client = createQwenClient();
  try {
    const response = await client.answer({
      prompt: buildJudgePrompt(input),
      systemPrompt: "你是一位专业的医学评分专家。",
    });
    return parseJudgeResponse(response.text);
  } catch (err) {
    console.error("Judge error:", err);
    return null;
  }
}
