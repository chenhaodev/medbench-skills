# MedBench Improve Skill

Run the calibration-guided strategy evolution loop after receiving MedBench scores.
Targets pseudo-wrong questions (lowest-confidence answers) for improvement.

## Prerequisites

- Cycle N pipeline run already completed (`/medbench-run`)
- Per-task scores received from MedBench dashboard
- `.env` populated with API keys (Qwen required for judge calls)

## Step 1: Record Per-Task Scores

Record each task's MedBench score via the MCP tool or CLI:

**Via MCP tool** (if medbench MCP server is running):
```
record_cycle_result(cycle_id=1, task="MedSafety", strategy_hash="medsafety_v1", score=0.82)
record_cycle_result(cycle_id=1, task="MedExam", strategy_hash="default_v1", score=0.75)
# ... repeat for each task
```

**Via CLI directly**:
```bash
# Edit history/scores.json manually, or run the MCP server and use Claude to call the tool
npx tsx mcp-server/index.ts
```

## Step 2: Run the Improvement Loop

```bash
# Basic run (improves tasks with lowest scores first, within $1.70 budget)
npx tsx pipeline/run-improve.ts --cycle=1

# With MedBench score calibration (recommended — targets pseudo-wrong questions)
npx tsx pipeline/run-improve.ts --cycle=1 \
  --calibrate=MedSafety:0.82,MedExam:0.75,MedDiag:0.68

# Adjust improvement budget
MAX_DAILY_COST_USD=8 PIPELINE_COST_USD=5 npx tsx pipeline/run-improve.ts --cycle=1
```

Arguments:
- `--cycle=N` — cycle number (must match the scores just recorded)
- `--calibrate=Task:score,...` — comma-separated task:score pairs from MedBench dashboard

## Step 3: Review Evolved Strategies

```bash
# See which strategies changed
git diff history/strategies/

# View the new strategy for a task
cat history/strategies/MedExam.json

# Check the archive of previous versions
ls history/strategies/archive/MedExam/
```

## Step 4: Rollback a Strategy (if needed)

If the next cycle's score is worse, restore the previous version:
```bash
# List archived versions
ls history/strategies/archive/MedExam/

# Restore a specific version
cp history/strategies/archive/MedExam/abc123__2026-02-23.json \
   history/strategies/MedExam.json
```

## Step 5: Commit Updated Strategies

```bash
git add history/strategies/
git commit -m "feat: deploy evolved strategies for cycle N"
```

## Step 6: Run Next Cycle

```bash
/medbench-run
```

## Budget Notes

Default budget allocation (configurable via env vars):
- `MAX_DAILY_COST_USD=6` — total daily budget
- `PIPELINE_COST_USD=4.30` — estimated pipeline cost (temperature sampling + ensemble)
- Remaining ~$1.70 goes to improvement loop

Tasks are processed in ascending score order (worst task first). The loop stops when the budget is exhausted.

## Locked Tasks

Some tasks (e.g. `MedSafety`) are locked and will never be evolved:
```json
{ "locked": true, "lockedReason": "Qwen ONLY — do not evolve" }
```
These tasks are silently skipped by the improvement loop.
