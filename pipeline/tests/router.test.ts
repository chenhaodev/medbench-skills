// pipeline/tests/router.test.ts
import { describe, it, expect } from 'vitest'
import { route } from '../router'

describe('route — LLM track (all → qwen)', () => {
  it('routes MedExam to qwen', () => {
    expect(route('MedExam_V4').model).toBe('qwen')
    expect(route('MedExam_V4').track).toBe('LLM')
    expect(route('MedExam_V4').taskName).toBe('MedExam')
  })

  it('routes MedSafety to qwen (CRITICAL: GPT-4o scores 2.7/100)', () => {
    expect(route('MedSafety_V4').model).toBe('qwen')
  })

  it('routes MedEthics and MedRxCheck variants to qwen', () => {
    expect(route('MedEthics_V4').model).toBe('qwen')
    expect(route('MedRxCheck_V4').model).toBe('qwen')
    expect(route('MedRxCheck_V4_MSQ').model).toBe('qwen')
    expect(route('MedRxCheck_V4_SCQ').model).toBe('qwen')
  })

  it('routes LLM sources without version suffix to qwen', () => {
    expect(route('MedMC').model).toBe('qwen')
    expect(route('MedPopular').model).toBe('qwen')
    expect(route('CTR-QC').model).toBe('qwen')
  })

  it('routes MedTreat with lowercase v to qwen', () => {
    expect(route('MedTreat_v4').model).toBe('qwen')
  })
})

describe('route — Agent track', () => {
  it('routes MedCallAPI and MedRefAPI to gpt', () => {
    expect(route('MedCallAPI_V4').model).toBe('gpt')
    expect(route('MedRefAPI_V4').model).toBe('gpt')
  })

  it('routes MedReflect and MedDBOps to gemini', () => {
    expect(route('MedReflect_V4').model).toBe('gemini')
    expect(route('MedDBOps_V4').model).toBe('gemini')
  })

  it('routes other Agent tasks to claude', () => {
    expect(route('MedCOT_V4').model).toBe('claude')
    expect(route('MedShield_V4').model).toBe('claude')
    expect(route('MedCollab_V4').model).toBe('claude')
    expect(route('MedDecomp_V4').model).toBe('claude')
    expect(route('MedIntentID').model).toBe('claude')
    expect(route('MedLongQA').model).toBe('claude')
  })
})

describe('route — VLM track', () => {
  it('routes MedVQA and CXR-QC (MedQC file) to gemini', () => {
    expect(route('MedVQA_V4').model).toBe('gemini')
    expect(route('CXR-QC').model).toBe('gemini')
  })

  it('routes MedDetect, MedClass, IR-CMeEE (MedOCR), MedDiffDx, MedTherapy to gpt', () => {
    expect(route('MedDetect_V4').model).toBe('gpt')
    expect(route('MedClass_V4').model).toBe('gpt')
    expect(route('IR-CMeEE').model).toBe('gpt')
    expect(route('MedDiffDx_V4').model).toBe('gpt')
    expect(route('MedTherapy_V4').model).toBe('gpt')
  })

  it('routes MedGen, MedSeqIm, MedCourse to claude', () => {
    expect(route('MedGen_V4').model).toBe('claude')
    expect(route('MedSeqIm_V4').model).toBe('claude')
    expect(route('MedCourse_V4').model).toBe('claude')
  })
})

describe('route — taskName extraction', () => {
  it('strips _V4 version suffix', () => {
    expect(route('MedExam_V4').taskName).toBe('MedExam')
    expect(route('MedCOT_V4').taskName).toBe('MedCOT')
  })

  it('strips multi-part version like _V4_MSQ', () => {
    expect(route('MedRxCheck_V4_MSQ').taskName).toBe('MedRxCheck')
  })

  it('strips lowercase version like _v4', () => {
    expect(route('MedTreat_v4').taskName).toBe('MedTreat')
  })

  it('returns source as-is when no version suffix', () => {
    expect(route('MedMC').taskName).toBe('MedMC')
    expect(route('CXR-QC').taskName).toBe('CXR-QC')
  })
})

describe('route — error handling', () => {
  it('throws on unknown source', () => {
    expect(() => route('UnknownTask_V4')).toThrow()
  })
})
