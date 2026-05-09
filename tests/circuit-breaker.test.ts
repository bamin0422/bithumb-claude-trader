import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../electron/trader/circuit-breaker";

describe("CircuitBreaker", () => {
  it("trips after 3 claude failures", () => {
    const cb = new CircuitBreaker();
    cb.recordClaudeFailure(); cb.recordClaudeFailure(); cb.recordClaudeFailure();
    expect(cb.shouldHalt().halt).toBe(true);
  });
  it("trips after 5 consecutive losing trades", () => {
    const cb = new CircuitBreaker();
    for (let i = 0; i < 5; i++) cb.recordTrade({ pnl_pct: -2 });
    expect(cb.shouldHalt().halt).toBe(true);
  });
  it("resets on a winning trade", () => {
    const cb = new CircuitBreaker();
    cb.recordTrade({ pnl_pct: -2 }); cb.recordTrade({ pnl_pct: -1 });
    cb.recordTrade({ pnl_pct: 3 });
    cb.recordTrade({ pnl_pct: -1 }); cb.recordTrade({ pnl_pct: -1 });
    expect(cb.shouldHalt().halt).toBe(false);
  });
});
