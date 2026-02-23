// pipeline/tests/smoke.test.ts
// Integration smoke test — calls live APIs with ONE real MedBench question.
// Skipped if API keys are absent.
import "dotenv/config";
import { describe, it, expect } from "vitest";
import { getClient } from "../clients";

// A real MCQ question from MedExam_V4 (LLM track)
const MCQ_PROMPT = `下列哪一项不是老年病的临床特点
A. 临床表现不典型
B. 疾病发展缓慢
C. 多病共存
D. 单一病种
E. 发病方式独特`;

const SYSTEM = "请回答单项选择题，只输出选项字母，不要输出文字说明。";

async function smokeOne(
  model: "qwen" | "claude" | "gemini" | "gpt",
  envKey: string,
) {
  if (!process.env[envKey]) {
    console.log(`  SKIP ${model}: ${envKey} not set`);
    return null;
  }
  const client = getClient(model);
  const res = await client.answer({ prompt: MCQ_PROMPT, systemPrompt: SYSTEM });
  return res;
}

describe("API smoke tests (live calls)", () => {
  it("qwen responds with non-empty text", async () => {
    const res = await smokeOne("qwen", "QWEN_API_KEY");
    if (!res) return;
    console.log(
      `  qwen [${process.env.QWEN_MODEL ?? "qwen3-max"}] → "${res.text}" (${res.tokensUsed} tokens, ${res.latencyMs}ms)`,
    );
    expect(res.text.length).toBeGreaterThan(0);
  }, 30_000);

  it("claude responds with non-empty text", async () => {
    const res = await smokeOne("claude", "ANTHROPIC_API_KEY");
    if (!res) return;
    console.log(
      `  claude [${process.env.CLAUDE_MODEL ?? "claude-opus-4-6"}] → "${res.text}" (${res.tokensUsed} tokens, ${res.latencyMs}ms)`,
    );
    expect(res.text.length).toBeGreaterThan(0);
  }, 30_000);

  it("gemini responds with non-empty text", async () => {
    const res = await smokeOne("gemini", "GEMINI_API_KEY");
    if (!res) return;
    console.log(
      `  gemini [${process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview"}] → "${res.text}" (${res.tokensUsed} tokens, ${res.latencyMs}ms)`,
    );
    expect(res.text.length).toBeGreaterThan(0);
  }, 30_000);

  it("gpt responds with non-empty text", async () => {
    const res = await smokeOne("gpt", "OPENAI_API_KEY");
    if (!res) return;
    console.log(
      `  gpt [${process.env.OPENAI_MODEL ?? "gpt-5.2"}] → "${res.text}" (${res.tokensUsed} tokens, ${res.latencyMs}ms)`,
    );
    expect(res.text.length).toBeGreaterThan(0);
  }, 30_000);
});
