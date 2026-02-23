# MedBench Skills

An autonomous pipeline for [MedBench](https://medbench.org) — a Chinese medical AI benchmark. Runs daily cycles of model inference, ensemble confidence scoring, and self-improving prompt strategy evolution without human intervention.

## Architecture

```
medbench/               ← MedBench zip files (LLM / Agent / VLM tracks)
pipeline/
  extractor.ts          ← reads questions from zip JSONL files
  router.ts             ← routes each task source to best model
  clients/              ← API clients: Qwen, GPT, Gemini, Claude
  strategies.ts         ← loads per-task prompt strategies
  formatter.ts          ← extracts MCQ answers, validates submit schema
  ensemble.ts           ← temperature sampling + Dawid-Skene EM
  judge.ts              ← LLM-as-judge scoring (Qwen)
  improve.ts            ← strategy evolution with rollback archive
  run.ts                ← daily pipeline entry point
  run-improve.ts        ← improvement loop entry point
mcp-server/             ← Claude Code MCP tools
  tools/route.ts        ← route_question
  tools/record.ts       ← record_cycle_result, get_best_strategy
  tools/report.ts       ← get_cycle_report
history/
  strategies/           ← per-task prompt strategies (JSON)
  strategies/archive/   ← versioned strategy history for rollback
  questions/            ← per-question answer + confidence history
  scores.json           ← per-task score history across cycles
results/
  cycle_N/
    submit/             ← JSONL files to upload to MedBench
    enriched/           ← internal metadata (confidence, ensemble)
    report.json         ← cycle summary
skills/
  medbench-run.md       ← Claude Code skill: run the pipeline
  medbench-improve.md   ← Claude Code skill: run the improvement loop
```

## Quick Start

**1. Install dependencies**
```bash
npm install
```

**2. Configure API keys**
```bash
cp .env.example .env
# Fill in: QWEN_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
```

**3. Add MedBench zip files**
```
medbench/MedBench_LLM.zip
medbench/MedBench_Agent.zip
medbench/MedBench_VLM.zip
```

**4. Run a cycle**
```bash
npx tsx pipeline/run.ts
```

Submit `results/cycle_1/submit/*.jsonl` to the MedBench dashboard.

## Daily Cycle

```
run.ts  ──────────────────────────────────────────────────────────────────►
  extract questions from zips
  route each source → model (Qwen / GPT / Gemini / Claude)
  per question:
    temperature sampling × 5 → empirical confidence
    if confidence < 0.70 → Dawid-Skene ensemble with secondary model
    save question record (answer, confidence, ensemble) to history/
  write results/cycle_N/submit/  ← upload these to MedBench
  write results/cycle_N/enriched/  ← internal metadata
```

After receiving scores from MedBench:

```
run-improve.ts  ──────────────────────────────────────────────────────────►
  load per-task scores (ascending — worst task first)
  calibrate: mark top-score% questions as pseudo-correct
  target pseudo-wrong questions for strategy improvement
  test 3 strategy variants (CoT / authority persona / lower temperature)
  evaluate each variant with LLM judge (Qwen)
  deploy best if improvement > 0.5% — archive previous strategy first
```

## Model Routing

| Track | Task examples | Model |
|-------|--------------|-------|
| LLM | MedExam, MedSafety, MedDiag | Qwen (`qwen3-max`) |
| Agent | MedCallAPI, MedRefAPI | GPT (`gpt-5.2`) |
| Agent | MedDBOps, MedReflect | Gemini (`gemini-3.1-pro-preview`) |
| Agent | MedCOT, MedCollab, MedPathPlan | Claude (`claude-opus-4-6`) |
| VLM | CXR-QC | Gemini |
| VLM | IR-CMeEE | GPT |

Override model names via env vars: `QWEN_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, `CLAUDE_MODEL`.

## Cost Guard

The pipeline aborts if accumulated token cost exceeds `MAX_DAILY_COST_USD` (default: `$6`).

Improvement loop budget: `MAX_DAILY_COST_USD − PIPELINE_COST_USD` (default: ~`$1.70`).

## Strategy Versioning

Strategies are stored in `history/strategies/{taskName}.json`. Before any deployment, the current strategy is archived to `history/strategies/archive/{taskName}/{hash}__{date}.json`.

**Rollback:**
```bash
cp history/strategies/archive/MedExam/abc123__2026-02-23.json \
   history/strategies/MedExam.json
```

Locked tasks (e.g. `MedSafety`) are never evolved:
```json
{ "locked": true, "lockedReason": "Qwen ONLY — do not evolve" }
```

## MCP Server

Exposes four tools for use in Claude Code:

| Tool | Description |
|------|-------------|
| `route_question` | Which model handles this task source? |
| `record_cycle_result` | Record a per-task score after submission |
| `get_best_strategy` | Best strategy hash + score for a task |
| `get_cycle_report` | Full report for a given cycle |

**Add to Claude Code:**
```bash
# Copy mcp-server/mcp.json config to ~/.claude/claude_desktop_config.json
# or register via: claude mcp add medbench -- npx tsx mcp-server/index.ts
```

## Development

```bash
npm test          # run all tests (75 tests across 10 files)
npm run typecheck # TypeScript type check
```

Environment:
- Node.js 24, TypeScript, Vitest
- `dotenv/config` loaded in all entry points and tests
