// mcp-server/index.ts
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { routeQuestion } from "./tools/route";
import { recordCycleResult, getBestStrategy } from "./tools/record";
import { getCycleReport } from "./tools/report";

const server = new McpServer({ name: "medbench", version: "1.0.0" });

server.tool(
  "route_question",
  "Route a MedBench question to best model per leaderboard data",
  { task_source: z.string(), question: z.string() },
  async ({ task_source, question }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(routeQuestion({ taskSource: task_source, question })),
      },
    ],
  })
);

server.tool(
  "record_cycle_result",
  "Record a per-task score after MedBench submission",
  {
    cycle_id: z.number(),
    task: z.string(),
    strategy_hash: z.string(),
    score: z.number().min(0).max(1),
  },
  async ({ cycle_id, task, strategy_hash, score }) => {
    await recordCycleResult({
      cycleId: cycle_id,
      task,
      strategyHash: strategy_hash,
      score,
    });
    return { content: [{ type: "text", text: "Recorded" }] };
  }
);

server.tool(
  "get_best_strategy",
  "Get best-performing strategy for a task from history",
  { task: z.string() },
  async ({ task }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(await getBestStrategy(task)),
      },
    ],
  })
);

server.tool(
  "get_cycle_report",
  "Get full cycle report for a given cycle ID",
  { cycle_id: z.number() },
  async ({ cycle_id }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(await getCycleReport(cycle_id)),
      },
    ],
  })
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("MedBench MCP server running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
