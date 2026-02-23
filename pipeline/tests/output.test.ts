// pipeline/tests/output.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeSubmitFile, writeEnrichedFile, writeCycleReport, cycleDir } from '../output'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medbench-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true })
})

describe('writeSubmitFile', () => {
  it('writes JSONL with only question/answer/other fields', async () => {
    const items = [
      { question: 'Q1?', answer: 'A', other: { id: 1, source: 'MedExam_V4' } },
      { question: 'Q2?', answer: 'B', other: { id: 2, source: 'MedExam_V4' } },
    ]
    const outPath = path.join(tmpDir, 'submit.jsonl')
    await writeSubmitFile(items, outPath)

    const content = await fs.readFile(outPath, 'utf-8')
    const lines = content.trim().split('\n').map(l => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ question: 'Q1?', answer: 'A', other: { id: 1, source: 'MedExam_V4' } })
    expect(lines[0]).not.toHaveProperty('confidence')
  })

  it('creates parent directories if missing', async () => {
    const outPath = path.join(tmpDir, 'sub', 'dir', 'submit.jsonl')
    await writeSubmitFile([{ question: 'Q?', answer: 'A', other: { id: 1, source: 'MedExam_V4' } }], outPath)
    await expect(fs.access(outPath)).resolves.toBeUndefined()
  })
})

describe('writeEnrichedFile', () => {
  it('writes enriched JSONL with all metadata fields including ensemble', async () => {
    const enriched = [{
      id: 1, source: 'MedExam_V4', answer: 'A',
      confidence: 0.87, model: 'qwen3-max',
      strategy: 'default_v1', strategyHash: 'abc123',
      judgeScore: 0.91, tokensUsed: 340, latencyMs: 820, cycle: 1,
      ensembleAnswer: 'A',
      allModelAnswers: { qwen: 'A', claude: 'A', gemini: 'B' },
      temperatureSamples: ['A', 'A', 'A', 'B', 'A'],
      answerStability: 0.90,
      pseudoCorrect: null,
    }]
    const outPath = path.join(tmpDir, 'enriched.jsonl')
    await writeEnrichedFile(enriched, outPath)

    const content = await fs.readFile(outPath, 'utf-8')
    const line = JSON.parse(content.trim())
    expect(line).toMatchObject({ confidence: 0.87, model: 'qwen3-max', cycle: 1 })
    expect(line).toHaveProperty('ensembleAnswer')
    expect(line).toHaveProperty('allModelAnswers')
    expect(line).toHaveProperty('temperatureSamples')
    expect(line).toHaveProperty('answerStability')
    expect(line).toHaveProperty('pseudoCorrect')
  })
})

describe('writeCycleReport', () => {
  it('writes formatted JSON report', async () => {
    const report = {
      cycle: 1, date: '2026-02-23',
      submittedTracks: ['LLM'], apiCostUsd: 4.21,
      scores: {}, trackAverages: {}, weakestTasks: [], improvementPlan: [], nextCycle: 2,
    }
    const outPath = path.join(tmpDir, 'report.json')
    await writeCycleReport(report, outPath)

    const content = JSON.parse(await fs.readFile(outPath, 'utf-8'))
    expect(content.cycle).toBe(1)
    expect(content.apiCostUsd).toBe(4.21)
  })
})

describe('cycleDir', () => {
  it('returns a path containing the cycle number', () => {
    expect(cycleDir(3)).toContain('cycle_3')
  })
})
