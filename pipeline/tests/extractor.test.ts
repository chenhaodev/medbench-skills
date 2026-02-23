// pipeline/tests/extractor.test.ts
import { describe, it, expect } from 'vitest'
import { extractTrack, groupBySource } from '../extractor'

describe('extractTrack', () => {
  it('returns an array of question items for LLM track', async () => {
    const items = await extractTrack('LLM')
    expect(items.length).toBeGreaterThan(100)
    expect(items[0]).toMatchObject({
      question: expect.any(String),
      answer: '',
      other: {
        id: expect.any(Number),
        source: expect.any(String),
      },
    })
  })

  it('preserves original answer field as empty string for all tracks', async () => {
    const items = await extractTrack('Agent')
    expect(items.every(i => i.answer === '')).toBe(true)
  })

  it('VLM items include img_path for image questions', async () => {
    const items = await extractTrack('VLM')
    expect(items.length).toBeGreaterThan(0)
    const withImage = items.filter(i => i.img_path && i.img_path.length > 0)
    expect(withImage.length).toBeGreaterThan(0)
  })

  it('throws on unknown track', async () => {
    await expect(extractTrack('UNKNOWN' as any)).rejects.toThrow()
  })
})

describe('groupBySource', () => {
  it('groups items by their other.source field', async () => {
    const items = await extractTrack('LLM')
    const grouped = groupBySource(items)
    expect(grouped.size).toBeGreaterThan(1)
    for (const [source, group] of grouped) {
      expect(group.every(i => i.other.source === source)).toBe(true)
    }
  })
})
