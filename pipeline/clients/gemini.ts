// pipeline/clients/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ApiClient, AnswerRequest, AnswerResponse } from "./index";

export function createGeminiClient(): ApiClient {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const genAI = new GoogleGenerativeAI(key);

  return {
    async answer({
      prompt,
      systemPrompt,
      imageBase64,
      imageMimeType,
      temperature,
    }: AnswerRequest): Promise<AnswerResponse> {
      const start = Date.now();
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
        generationConfig: { temperature: temperature ?? 0.2 },
      });

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = imageBase64
        ? [
            {
              inlineData: {
                data: imageBase64,
                mimeType: imageMimeType ?? "image/jpeg",
              },
            },
            { text: prompt },
          ]
        : [{ text: prompt }];

      const result = await model.generateContent(parts);
      const text = result.response.text();
      const usage = result.response.usageMetadata;

      return {
        text,
        confidence: 0.86,
        tokensUsed:
          (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
        latencyMs: Date.now() - start,
      };
    },
  };
}
