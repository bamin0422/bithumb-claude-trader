import cron from "node-cron";
import { Orchestrator } from "@main/trader/orchestrator";
import { getSettings } from "@main/storage/settings";

let task: ReturnType<typeof cron.schedule> | null = null;

export function startScheduler(orch: Orchestrator) {
  stopScheduler();
  const s = getSettings();
  const min = Math.max(1, Math.min(60, s.decision_interval_min));
  const expr = `*/${min} * * * *`;
  task = cron.schedule(expr, () => { orch.runCycle().catch(console.error); });
  console.log(`[scheduler] cron ${expr}`);
}

export function stopScheduler() { if (task) { task.stop(); task = null; } }
