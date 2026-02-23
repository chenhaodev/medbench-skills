// pipeline/clients/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import type { ApiClient, AnswerRequest, AnswerResponse } from './index'

export function createClaudeClient(): ApiClient {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey: key })

  return {
    async answer({ prompt, systemPrompt, imageBase64, imageMimeType, temperature }: AnswerRequest): Promise<AnswerResponse> {
      const start = Date.now()
      const content: Anthropic.MessageParam['content'] = imageBase64
        ? [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (imageMimeType ?? 'image/jpeg') as Anthropic.Base64ImageSource['media_type'],
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ]
        : prompt

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        temperature: temperature ?? 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      })

      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      return {
        text,
        confidence: 0.88,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        latencyMs: Date.now() - start,
      }
    },
  }
}
