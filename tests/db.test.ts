import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../electron/storage/db";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("db migrations", () => {
  it("creates 8 tables on fresh db", () => {
    const dir = mkdtempSync(join(tmpdir(), "trader-db-"));
    const db = openDb(join(dir, "test.db"));
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map((r: any) => r.name).sort();
    expect(tables).toEqual([
      "coin_scores","daily_performance","decisions","events",
      "market_cache","portfolio_snapshots","positions","trade_attempts"
    ]);
  });
});
