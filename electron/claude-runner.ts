import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DecisionResponseSchema, type DecisionResponse } from "@shared/zod-schemas";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
const TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;

export type ClaudeInput = { systemPrompt: string; userJson: object };
export type ClaudeOk = { ok: true; decision: DecisionResponse; raw: string;
                        cost_usd?: number; duration_ms: number };
export type ClaudeErr = { ok: false; error: string; raw?: string; duration_ms: number };

export function parseClaudeEnvelope(stdout: string):
  | { ok: true; decision: DecisionResponse; cost_usd?: number }
  | { ok: false; error: string }
{
  try {
    const env = JSON.parse(stdout);
    const text = env.result ?? env.text ?? stdout;
    let inner: any;
    if (typeof text === "string") {
      // Strip markdown code fences if Claude wrapped JSON in them
      const cleaned = text.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      inner = JSON.parse(cleaned);
    } else {
      inner = text;
    }
    const decision = DecisionResponseSchema.parse(inner);
    return { ok: true, decision, cost_usd: env.total_cost_usd };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function runClaudeDecision(input: ClaudeInput): Promise<ClaudeOk | ClaudeErr> {
  const t0 = Date.now();
  const workdir = await mkdtemp(join(tmpdir(), "claude-decision-"));
  const sysFile = join(workdir, "system.md");
  await writeFile(sysFile, input.systemPrompt);

  const userPrompt = [
    "Below is the current market and portfolio state as JSON.",
    "Follow the operating manual (system prompt) exactly.",
    "Output ONLY the JSON object specified in section 7 (Output Schema). No prose. No markdown code fences.",
    "",
    JSON.stringify(input.userJson)
  ].join("\n");

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const stdout = await spawnClaude(userPrompt, sysFile);
        const parsed = parseClaudeEnvelope(stdout);
        if (parsed.ok) {
          return { ok: true, decision: parsed.decision, raw: stdout,
                   cost_usd: parsed.cost_usd, duration_ms: Date.now() - t0 };
        }
        if (attempt === MAX_RETRIES) {
          return { ok: false, error: parsed.error, raw: stdout, duration_ms: Date.now() - t0 };
        }
      } catch (e: any) {
        if (attempt === MAX_RETRIES) {
          return { ok: false, error: e.message, duration_ms: Date.now() - t0 };
        }
      }
    }
    return { ok: false, error: "max retries exceeded", duration_ms: Date.now() - t0 };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

function spawnClaude(userPrompt: string, systemPromptFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "json",
      "--append-system-prompt-file", systemPromptFile,
      "--model", MODEL,
      "--no-session-persistence",
      "--disallowedTools", "Bash Edit Write Read Grep Glob WebFetch WebSearch Task TodoWrite NotebookEdit"
    ];
    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, CI: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let out = "", err = "";
    child.stdout.on("data", c => out += c.toString());
    child.stderr.on("data", c => err += c.toString());
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`claude timeout`)); }, TIMEOUT_MS);
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exit ${code}: ${err.slice(0, 500)}`));
      else resolve(out);
    });
    // Send user prompt via stdin (avoids ARG_MAX limit)
    child.stdin.write(userPrompt);
    child.stdin.end();
  });
}
