// pipeline/router.ts
export type ModelKey = "qwen" | "claude" | "gemini" | "gpt";
export type Track = "LLM" | "Agent" | "VLM";

interface RouteResult {
  model: ModelKey;
  track: Track;
  taskName: string;
}

// Strip _V<digits> and any trailing suffix (e.g. _V4_MSQ, _v4) to get canonical task name.
// Handles: _V4, _V4_MSQ, _V4_SCQ, _v4 (lowercase)
function taskNameFromSource(source: string): string {
  return source.replace(/_[Vv]\d+.*$/, "");
}

type RouteEntry = { model: ModelKey; track: Track };

// Explicit routing table keyed by actual source field values found in the JSONL files.
// — LLM track: ALL sources route to qwen (critical: GPT-4o scores ~2.7/100 on MedSafety)
// — Agent: gpt for API-calling tasks; gemini for reflection/DB-ops; claude for the rest
// — VLM: gemini for QA/QC; gpt for detection/classification/OCR; claude for generation/sequential
const ROUTING: Record<string, RouteEntry> = {
  // ─── LLM track — Qwen for ALL ─────────────────────────────────────────────
  "CMB-Clin-extended_V4": { model: "qwen", track: "LLM" },
  "DDx-advanced_V4": { model: "qwen", track: "LLM" },
  MedAnalysis_V4: { model: "qwen", track: "LLM" },
  MedCare_V4: { model: "qwen", track: "LLM" },
  MedChartQC_V4: { model: "qwen", track: "LLM" },
  MedDiag_V4: { model: "qwen", track: "LLM" },
  MedDiffer_V4: { model: "qwen", track: "LLM" },
  MedEthics_V4: { model: "qwen", track: "LLM" },
  MedExam_V4: { model: "qwen", track: "LLM" },
  MedExplain_V4: { model: "qwen", track: "LLM" },
  MedHC_V4: { model: "qwen", track: "LLM" },
  MedHG_V4: { model: "qwen", track: "LLM" },
  MedInsureCalc_V4: { model: "qwen", track: "LLM" },
  MedInsureCheck_V4: { model: "qwen", track: "LLM" },
  MedLitQA_V4: { model: "qwen", track: "LLM" },
  MedMC: { model: "qwen", track: "LLM" },
  MedOutcome_V4: { model: "qwen", track: "LLM" },
  MedPathQC_V4: { model: "qwen", track: "LLM" },
  MedPHM_V4: { model: "qwen", track: "LLM" },
  MedPopular: { model: "qwen", track: "LLM" },
  MedPrimary_V4: { model: "qwen", track: "LLM" },
  MedPsychCare: { model: "qwen", track: "LLM" },
  MedPsychQA: { model: "qwen", track: "LLM" },
  MedRecordGen: { model: "qwen", track: "LLM" },
  MedRehab: { model: "qwen", track: "LLM" },
  "CTR-QC": { model: "qwen", track: "LLM" },
  MedRxCheck_V4_MSQ: { model: "qwen", track: "LLM" },
  MedRxCheck_V4_SCQ: { model: "qwen", track: "LLM" },
  MedRxCheck_V4: { model: "qwen", track: "LLM" },
  MedRxPlan_V4: { model: "qwen", track: "LLM" },
  MedSafety_V4: { model: "qwen", track: "LLM" }, // LOCKED: GPT-4o 2.7/100
  MedSpeQA: { model: "qwen", track: "LLM" },
  MedSummary: { model: "qwen", track: "LLM" },
  MedSynonym: { model: "qwen", track: "LLM" },
  MedTeach_V4: { model: "qwen", track: "LLM" },
  MedTerm_V4: { model: "qwen", track: "LLM" },
  MedTreat_v4: { model: "qwen", track: "LLM" }, // lowercase v
  SMDoc_V4: { model: "qwen", track: "LLM" },

  // ─── Agent track ──────────────────────────────────────────────────────────
  // GPT: API-calling tasks (GPT leads function-calling capability)
  MedCallAPI_V4: { model: "gpt", track: "Agent" },
  MedRefAPI_V4: { model: "gpt", track: "Agent" },
  // Gemini: reflection and DB-operations
  MedReflect_V4: { model: "gemini", track: "Agent" },
  MedDBOps_V4: { model: "gemini", track: "Agent" },
  // Claude: long-context, complex reasoning, roleplay, ethics defence
  MedCollab_V4: { model: "claude", track: "Agent" },
  MedCOT_V4: { model: "claude", track: "Agent" },
  MedDecomp_V4: { model: "claude", track: "Agent" },
  MedDefend_V4: { model: "claude", track: "Agent" },
  MedIntentID: { model: "claude", track: "Agent" },
  MedLongConv_V4: { model: "claude", track: "Agent" },
  MedLongQA: { model: "claude", track: "Agent" },
  MedPathPlan_V4: { model: "claude", track: "Agent" },
  MedRoleAdapt: { model: "claude", track: "Agent" },
  MedShield_V4: { model: "claude", track: "Agent" },

  // ─── VLM track ────────────────────────────────────────────────────────────
  // Gemini: visual QA and quality control from CXR images
  MedVQA_V4: { model: "gemini", track: "VLM" },
  "CXR-QC": { model: "gemini", track: "VLM" }, // from MedQC.jsonl
  // GPT: detection, classification, OCR (IR-CMeEE = MedOCR.jsonl), diff-dx, therapy selection
  MedDetect_V4: { model: "gpt", track: "VLM" },
  MedClass_V4: { model: "gpt", track: "VLM" },
  "IR-CMeEE": { model: "gpt", track: "VLM" }, // from MedOCR.jsonl
  MedDiffDx_V4: { model: "gpt", track: "VLM" },
  MedTherapy_V4: { model: "gpt", track: "VLM" },
  // Claude: generation, sequential imaging, course content
  MedGen_V4: { model: "claude", track: "VLM" },
  MedSeqIm_V4: { model: "claude", track: "VLM" },
  MedCourse_V4: { model: "claude", track: "VLM" },
};

export function route(source: string): RouteResult {
  const entry = ROUTING[source];
  if (!entry) {
    throw new Error(
      `Unknown task source: "${source}". Add to router.ts ROUTING table.`,
    );
  }
  return { ...entry, taskName: taskNameFromSource(source) };
}
