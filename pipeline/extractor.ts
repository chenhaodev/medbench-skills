// pipeline/extractor.ts
import AdmZip from 'adm-zip'
import path from 'path'

export type Track = 'LLM' | 'Agent' | 'VLM'

export interface QuestionItem {
  question: string
  answer: string
  img_path?: string[]  // VLM only — array of image paths relative to zip's images/ dir
  other: { id: number; source: string; [key: string]: unknown }
}

const ZIP_MAP: Record<Track, string> = {
  LLM: path.resolve('medbench/MedBench_LLM.zip'),
  Agent: path.resolve('medbench/MedBench_Agent.zip'),
  VLM: path.resolve('medbench/MedBench_VLM.zip'),
}

export async function extractTrack(track: Track): Promise<QuestionItem[]> {
  if (!ZIP_MAP[track]) throw new Error(`Unknown track: ${track}`)
  const zip = new AdmZip(ZIP_MAP[track])
  const items: QuestionItem[] = []

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith('.jsonl')) continue
    const lines = zip.readAsText(entry).split('\n').filter(Boolean)
    for (const line of lines) {
      const raw = JSON.parse(line) as QuestionItem
      items.push({ ...raw, answer: '' })
    }
  }

  if (items.length === 0) throw new Error(`No JSONL data found in ${track} zip`)
  return items
}

export function groupBySource(items: QuestionItem[]): Map<string, QuestionItem[]> {
  const map = new Map<string, QuestionItem[]>()
  for (const item of items) {
    const src = item.other.source
    if (!map.has(src)) map.set(src, [])
    map.get(src)!.push(item)
  }
  return map
}
