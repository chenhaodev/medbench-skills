# MedBench Run Skill

Run the MedBench daily pipeline to generate answer submissions for all three tracks (LLM, Agent, VLM).

## Prerequisites

1. `.env` file populated with API keys:
   ```
   QWEN_API_KEY=...
   OPENAI_API_KEY=...
   GEMINI_API_KEY=...
   ANTHROPIC_API_KEY=...   # optional — Agent track only
   ```
2. MedBench zip files present in `medbench/`:
   - `medbench/MedBench_LLM.zip`
   - `medbench/MedBench_Agent.zip`
   - `medbench/MedBench_VLM.zip`

## Run the Pipeline

```bash
# All three tracks (full run)
npx tsx pipeline/run.ts

# Single track (faster, for testing)
ONLY_TRACK=LLM npx tsx pipeline/run.ts
ONLY_TRACK=Agent npx tsx pipeline/run.ts
ONLY_TRACK=VLM npx tsx pipeline/run.ts
```

Environment knobs:
- `MAX_DAILY_COST_USD` — abort if total token cost exceeds this (default: `6`)
- `ONLY_TRACK` — run one track only (`LLM` | `Agent` | `VLM`)
- `QWEN_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` / `CLAUDE_MODEL` — override default model names

## Check Output

After the run, submit files are in `results/cycle_N/submit/`:
```bash
ls results/cycle_1/submit/
# LLM_submit.jsonl   Agent_submit.jsonl   VLM_submit.jsonl

# Verify schema (should have ONLY question/answer/other — no enriched fields)
head -1 results/cycle_1/submit/LLM_submit.jsonl | python3 -m json.tool
```

Enriched metadata (confidence, ensemble, temperature samples) is in `results/cycle_N/enriched/` — **do not submit these files**.

## Submit to MedBench

Upload the `*_submit.jsonl` files to the MedBench evaluation dashboard. Wait for per-task scores to be returned.

## After Receiving Scores

Record scores and trigger the improvement loop:
```bash
/medbench-improve
```

Or manually record scores via the MCP tool:
```
record_cycle_result(cycle_id=1, task="MedSafety", strategy_hash="medsafety_v1", score=0.82)
```

## Cycle Report

A full cycle report is written to `results/cycle_N/report.json`:
```bash
cat results/cycle_1/report.json
```
