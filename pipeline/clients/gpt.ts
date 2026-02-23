// pipeline/clients/gpt.ts
import OpenAI from "openai";
import type { ApiClient, AnswerRequest, AnswerResponse } from "./index";

export function createGptClient(): ApiClient {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const openai = new OpenAI({ apiKey: key });

  return {
    async answer({
      prompt,
      systemPrompt,
      imageBase64,
      imageMimeType,
      temperature,
    }: AnswerRequest): Promise<AnswerResponse> {
      const start = Date.now();
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

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: temperature ?? 0.1,
        max_completion_tokens: 1024,
      });

      return {
        text: response.choices[0]?.message?.content ?? "",
        confidence: 0.87,
        tokensUsed: response.usage?.total_tokens ?? 0,
        latencyMs: Date.now() - start,
      };
    },
  };
}
