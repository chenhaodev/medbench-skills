// pipeline/tests/strategies.test.ts
import { describe, it, expect } from 'vitest'
import { loadStrategy, defaultStrategy, buildPrompt } from '../strategies'

describe('loadStrategy', () => {
  it('returns default strategy for unknown task', async () => {
    const s = await loadStrategy('UnknownTask')
    expect(s).toMatchObject({
      systemPrompt: expect.any(String),
      fewShots: expect.any(Array),
      temperature: expect.any(Number),
    })
  })

  it('returns MedSafety strategy with locked=true', async () => {
    const s = await loadStrategy('MedSafety')
    expect(s.locked).toBe(true)
    expect(s.systemPrompt.length).toBeGreaterThan(10)
  })

  it('returns default when no task-specific file exists', async () => {
    const s = await loadStrategy('NonExistentTask')
    expect(s.hash).toBe('default_v1')
  })
})

describe('defaultStrategy', () => {
  it('has all required fields', () => {
    expect(defaultStrategy).toHaveProperty('systemPrompt')
    expect(defaultStrategy).toHaveProperty('fewShots')
    expect(defaultStrategy).toHaveProperty('temperature')
    expect(defaultStrategy.temperature).toBeGreaterThan(0)
  })
})

describe('buildPrompt', () => {
  it('returns question directly when no few-shots', () => {
    const s = { ...defaultStrategy, fewShots: [] }
    expect(buildPrompt('What is X?', s)).toBe('What is X?')
  })

  it('prepends few-shot examples when present', () => {
    const s = { ...defaultStrategy, fewShots: [{ question: 'Q?', answer: 'A' }] }
    const prompt = buildPrompt('What is X?', s)
    expect(prompt).toContain('Q?')
    expect(prompt).toContain('What is X?')
  })
})
