// pipeline/clients/index.ts
import type { ModelKey } from "../router";
import { createQwenClient } from "./qwen";
import { createClaudeClient } from "./claude";
import { createPoeClient } from "./poe";
import { createGeminiClient } from "./gemini";
import { createGptClient } from "./gpt";

export interface AnswerRequest {
  prompt: string;
  systemPrompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  temperature?: number; // override client default; required for temperature sampling
}

export interface AnswerResponse {
  text: string;
  confidence: number;
  tokensUsed: number;
  latencyMs: number;
}

export interface ApiClient {
  answer(req: AnswerRequest): Promise<AnswerResponse>;
}

export function getClient(model: ModelKey): ApiClient {
  switch (model) {
    case "qwen":
      return createQwenClient();
    case "claude":
      if (process.env.ANTHROPIC_API_KEY) return createClaudeClient();
      if (process.env.POE_API_KEY) return createPoeClient();
      throw new Error(
        "No Claude client available: set ANTHROPIC_API_KEY or POE_API_KEY",
      );
    case "gemini":
      return createGeminiClient();
    case "gpt":
      return createGptClient();
    default:
      throw new Error(`Unknown model key: ${model}`);
  }
}
