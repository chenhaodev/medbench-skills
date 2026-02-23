// mcp-server/tools/report.ts
import fs from "fs/promises";
import path from "path";

export async function getCycleReport(cycleId: number) {
  const p = path.resolve(`results/cycle_${cycleId}/report.json`);
  return JSON.parse(await fs.readFile(p, "utf-8"));
}
