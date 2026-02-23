// pipeline/clients/poe.ts
// Poe OpenAI-compatible API — reuses the openai SDK with a different base URL.
// Model names on Poe follow the convention "Claude-Opus-4.6" (not the Anthropic form).
import OpenAI from "openai";
import type { ApiClient, AnswerRequest, AnswerResponse } from "./index";

export function createPoeClient(): ApiClient {
  const key = process.env.POE_API_KEY;
  if (!key) throw new Error("POE_API_KEY not set");

  const client = new OpenAI({
    apiKey: key,
    baseURL: "https://api.poe.com/v1",
  });

  return {
    async answer({
      prompt,
      systemPrompt,
      imageBase64,
      imageMimeType,
      temperature,
    }: AnswerRequest): Promise<AnswerResponse> {
      const start = Date.now();
      const model = process.env.POE_MODEL ?? "Claude-Opus-4.6";

      const userContent: OpenAI.Chat.ChatCompletionContentPart[] = imageBase64
        ? [
            {
              type: "image_url",
              image_url: {
                url: `data:${imageMimeType ?? "image/jpeg"};base64,${imageBase64}`,
              },
            },
            { type: "text", text: prompt },
          ]
        : [{ type: "text", text: prompt }];

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: temperature ?? 0.1,
        max_completion_tokens: 1024,
      });

      return {
        text: response.choices[0]?.message?.content ?? "",
        confidence: 0.88,
        tokensUsed: response.usage?.total_tokens ?? 0,
        latencyMs: Date.now() - start,
      };
    },
  };
}
