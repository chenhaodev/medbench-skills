// pipeline/clients/index.ts
import type { ModelKey } from '../router'
import { createQwenClient } from './qwen'
import { createClaudeClient } from './claude'
import { createGeminiClient } from './gemini'
import { createGptClient } from './gpt'

export interface AnswerRequest {
  prompt: string
  systemPrompt: string
  imageBase64?: string
  imageMimeType?: string
  temperature?: number  // override client default; required for temperature sampling
}

export interface AnswerResponse {
  text: string
  confidence: number
  tokensUsed: number
  latencyMs: number
}

export interface ApiClient {
  answer(req: AnswerRequest): Promise<AnswerResponse>
}

export function getClient(model: ModelKey): ApiClient {
  switch (model) {
    case 'qwen':   return createQwenClient()
    case 'claude': return createClaudeClient()
    case 'gemini': return createGeminiClient()
    case 'gpt':    return createGptClient()
    default: throw new Error(`Unknown model key: ${model}`)
  }
}
