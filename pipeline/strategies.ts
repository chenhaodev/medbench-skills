// pipeline/strategies.ts
import fs from 'fs/promises'
import path from 'path'

export interface Strategy {
  systemPrompt: string
  fewShots: Array<{ question: string; answer: string }>
  temperature: number
  hash: string
  locked?: boolean
  lockedReason?: string
}

const STRATEGIES_DIR = path.resolve('history/strategies')

export const defaultStrategy: Strategy = {
  systemPrompt: '你是一位经验丰富的中国临床医学专家。请仔细阅读问题，根据医学知识给出准确的回答。对于选择题，请直接回复选项字母（A/B/C/D/E）。',
  fewShots: [],
  temperature: 0.1,
  hash: 'default_v1',
}

export async function loadStrategy(taskName: string): Promise<Strategy> {
  const taskFile = path.join(STRATEGIES_DIR, `${taskName}.json`)
  try {
    const raw = await fs.readFile(taskFile, 'utf-8')
    return JSON.parse(raw) as Strategy
  } catch {
    try {
      const raw = await fs.readFile(path.join(STRATEGIES_DIR, 'default.json'), 'utf-8')
      return JSON.parse(raw) as Strategy
    } catch {
      return { ...defaultStrategy }
    }
  }
}

export function buildPrompt(question: string, strategy: Strategy): string {
  const shots = strategy.fewShots
    .map(s => `问题：${s.question}\n回答：${s.answer}`)
    .join('\n\n')
  return shots ? `${shots}\n\n问题：${question}\n回答：` : question
}
