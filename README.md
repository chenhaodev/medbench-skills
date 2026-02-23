# MedBench Skills

An autonomous pipeline for [MedBench](https://medbench.opencompass.org.cn) — a Chinese medical AI benchmark. Runs daily cycles of model inference, ensemble confidence scoring, and self-improving prompt strategy evolution without human intervention.

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

**Run a single track only** (e.g. while testing Agent tasks):
```bash
ONLY_TRACK=Agent npx tsx pipeline/run.ts
ONLY_TRACK=Agent npx tsx pipeline/run-improve.ts
```

Valid values: `LLM`, `Agent`, `VLM`. Omit to process all three tracks.

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

Override model names via env vars: `QWEN_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, `CLAUDE_MODEL`, `POE_MODEL`.

**Claude fallback priority:** `ANTHROPIC_API_KEY` (direct API) → `POE_API_KEY` (Poe subscription) → skip with warning.

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

<!-- AUTO-GENERATED from package.json scripts -->
| Command | Description |
|---------|-------------|
| `npm run run` | Run the daily inference pipeline (`pipeline/run.ts`) |
| `npm run improve` | Run the strategy improvement loop (`pipeline/run-improve.ts`) |
| `npm run mcp` | Start the MCP server (`mcp-server/index.ts`) |
| `npm test` | Run all tests (75 tests across 10 files) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
<!-- END AUTO-GENERATED -->

Environment:
- Node.js 24, TypeScript, Vitest
- `dotenv/config` loaded in all entry points and tests

## Environment Variables

<!-- AUTO-GENERATED from .env.example -->
| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `QWEN_API_KEY` | Yes | Qwen API key (inference + judge) | — |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (Agent track) | — |
| `GEMINI_API_KEY` | Yes* | Gemini API key (Agent + VLM tracks) | — |
| `ANTHROPIC_API_KEY` | Either* | Anthropic API key for Claude tasks | — |
| `POE_API_KEY` | Either* | Poe API key — used when `ANTHROPIC_API_KEY` is absent | — |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key (reserved) | — |
| `QWEN_MODEL` | No | Qwen model override | `qwen3-max` |
| `OPENAI_MODEL` | No | OpenAI model override | `gpt-5.2` |
| `GEMINI_MODEL` | No | Gemini model override | `gemini-3.1-pro-preview` |
| `CLAUDE_MODEL` | No | Claude model override (Anthropic) | `claude-opus-4-6` |
| `POE_MODEL` | No | Claude model name on Poe | `Claude-Opus-4.6` |
| `MAX_DAILY_COST_USD` | No | Hard budget cap before pipeline aborts | `6` |
| `PIPELINE_COST_USD` | No | Actual inference cost (auto-deducted from improve budget) | `4.30` |
| `ONLY_TRACK` | No | Limit to one track: `LLM`, `Agent`, or `VLM` | all tracks |
<!-- END AUTO-GENERATED -->

\* Claude tasks require either `ANTHROPIC_API_KEY` or `POE_API_KEY` (at least one). Other keys only required for the tracks that use that model (see Model Routing table).
