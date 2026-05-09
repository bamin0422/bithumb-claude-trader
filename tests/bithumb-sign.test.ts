import { describe, it, expect } from "vitest";
import { signRequest } from "../electron/bithumb/sign";

describe("bithumb sign", () => {
  it("produces deterministic HMAC-SHA512 base64", () => {
    const out = signRequest({
      endpoint: "/info/balance",
      params: { currency: "BTC" },
      apiSecret: "test_secret_string",
      nonce: "1700000000000000"
    });
    expect(out.signature).toBe(
      "MTMxMTE0OGNhYzI0YmIzMjQ3ZTE0MzYwZjg5NzA4MjFjY2RjZmMyNDFhY2IxZWYzOGRjOGNjNGIxMDQwOWNiZjMyMTNjYTUzZjBiYzM5YjZlMjA3NjQ1Mjc3YmY1YzhiZThlNzE0N2NkZTQyZmJhNGMzZTY4MDg0MGQ5YWE2ZTQ="
    );
    expect(out.body).toContain("currency=BTC");
    expect(out.body).toContain("endpoint=%2Finfo%2Fbalance");
  });
});
