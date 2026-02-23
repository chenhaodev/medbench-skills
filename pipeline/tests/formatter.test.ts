// pipeline/tests/formatter.test.ts
import { describe, it, expect } from 'vitest'
import { extractAnswer, validateSubmitItem } from '../formatter'

describe('extractAnswer', () => {
  it('extracts single letter MCQ from English answer', () => {
    expect(extractAnswer('The answer is A.', 'mcq')).toBe('A')
    expect(extractAnswer('**C**', 'mcq')).toBe('C')
  })

  it('extracts MCQ from Chinese answer', () => {
    expect(extractAnswer('答案是B', 'mcq')).toBe('B')
    expect(extractAnswer('选D', 'mcq')).toBe('D')
  })

  it('returns first MCQ letter when multiple present', () => {
    expect(extractAnswer('A and B are true', 'mcq')).toBe('A')
  })

  it('returns trimmed raw text for open tasks', () => {
    expect(extractAnswer('  The patient needs treatment X.  ', 'open')).toBe('The patient needs treatment X.')
  })

  it('returns empty string when no MCQ letter found', () => {
    expect(extractAnswer('No valid answer here', 'mcq')).toBe('')
  })

  it('extracts MCQ letter wrapped in angle brackets like <D>', () => {
    expect(extractAnswer('答：<D>', 'mcq')).toBe('D')
    expect(extractAnswer('<E>', 'mcq')).toBe('E')
  })
})

describe('validateSubmitItem', () => {
  it('accepts valid item', () => {
    expect(() => validateSubmitItem({
      question: 'Q?', answer: 'A', other: { id: 1, source: 'MedExam_V4' },
    })).not.toThrow()
  })

  it('accepts sources without _V suffix (e.g. MedMC, CTR-QC, IR-CMeEE)', () => {
    expect(() => validateSubmitItem({
      question: 'Q?', answer: 'B', other: { id: 2, source: 'MedMC' },
    })).not.toThrow()
    expect(() => validateSubmitItem({
      question: 'Q?', answer: 'C', other: { id: 3, source: 'CTR-QC' },
    })).not.toThrow()
    expect(() => validateSubmitItem({
      question: 'Q?', answer: 'A', other: { id: 4, source: 'IR-CMeEE' },
    })).not.toThrow()
  })

  it('throws when answer is undefined', () => {
    expect(() => validateSubmitItem({
      question: 'Q?', answer: undefined, other: { id: 1, source: 'MedExam_V4' },
    })).toThrow()
  })

  it('throws when other.id is missing', () => {
    expect(() => validateSubmitItem({
      question: 'Q?', answer: 'A', other: { source: 'MedExam_V4' },
    })).toThrow()
  })
})
