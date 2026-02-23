// pipeline/clients/qwen.ts
import OpenAI from 'openai'
import type { ApiClient, AnswerRequest, AnswerResponse } from './index'

export function createQwenClient(): ApiClient {
  const key = process.env.QWEN_API_KEY
  if (!key) throw new Error('QWEN_API_KEY not set')
  const openai = new OpenAI({
    apiKey: key,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  })

  return {
    async answer({ prompt, systemPrompt, temperature }: AnswerRequest): Promise<AnswerResponse> {
      const start = Date.now()
      const response = await openai.chat.completions.create({
        model: 'qwen-max',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: temperature ?? 0.1,
        max_tokens: 1024,
      })
      return {
        text: response.choices[0]?.message?.content ?? '',
        confidence: 0.85,
        tokensUsed: response.usage?.total_tokens ?? 0,
        latencyMs: Date.now() - start,
      }
    },
  }
}
