export class CircuitBreaker {
  private claudeFails = 0;
  private bithumbFails = 0;
  private consecutiveLosses = 0;
  private haltedUntil: number | null = null;
  private haltReason: string | null = null;

  recordClaudeSuccess() { this.claudeFails = 0; }
  recordClaudeFailure() {
    this.claudeFails++;
    if (this.claudeFails >= 3) this.halt(60 * 60_000, "Claude failed 3 times");
  }

  recordBithumbSuccess() { this.bithumbFails = 0; }
  recordBithumbFailure() {
    this.bithumbFails++;
    if (this.bithumbFails >= 5) this.halt(30 * 60_000, "Bithumb failed 5 times");
  }

  recordTrade(t: { pnl_pct: number }) {
    if (t.pnl_pct < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= 5) this.halt(60 * 60_000, "5 consecutive losses");
    } else {
      this.consecutiveLosses = 0;
    }
  }

  recordBtcCrash() { this.halt(60 * 60_000, "BTC crash detected"); }

  shouldHalt(): { halt: boolean; reason?: string; until?: number } {
    if (this.haltedUntil && Date.now() < this.haltedUntil) {
      return { halt: true, reason: this.haltReason!, until: this.haltedUntil };
    }
    if (this.haltedUntil) {
      this.haltedUntil = null; this.haltReason = null; this.claudeFails = 0;
      this.bithumbFails = 0; this.consecutiveLosses = 0;
    }
    return { halt: false };
  }

  private halt(ms: number, reason: string) {
    this.haltedUntil = Date.now() + ms;
    this.haltReason = reason;
  }

  reset() {
    this.claudeFails = 0; this.bithumbFails = 0; this.consecutiveLosses = 0;
    this.haltedUntil = null; this.haltReason = null;
  }
}
