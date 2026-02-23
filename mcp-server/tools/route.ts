// mcp-server/tools/route.ts
import { route } from "../../pipeline/router";

const API_KEY_MAP = {
  qwen: "QWEN_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  gpt: "OPENAI_API_KEY",
} as const;

export function routeQuestion(input: { taskSource: string; question: string }) {
  const r = route(input.taskSource);
  return {
    model: r.model,
    track: r.track,
    taskName: r.taskName,
    apiKeyEnv: API_KEY_MAP[r.model],
  };
}
