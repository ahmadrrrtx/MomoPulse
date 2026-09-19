/**
 * Phase 2 gate: the execution panel's quote box must be EXACTLY estimateBuy/estimateSell —
 * same BigInt path, no float drift — and the slippage/impact guards must behave.
 */
import { describe, it, expect } from "vitest";
import { buildBuyQuote, buildSellQuote, impactLevel } from "./quote";
import { estimateBuy, estimateSell } from "@/core/curve";
import type { LaunchpadPool } from "@/core/types";

const POOL = {
  pubkey: "p",
  virtualPaymentReserve: "360000000000000",
  virtualTokenReserve: "1073000000000000",
  tokensSold: "0",
  paymentRaisedNet: "0",
  graduationTarget: "1000000000000000",
  minBuy: "10000000", // 0.01 COOK
  maxBuyPerWallet: "500000000000", // 500 COOK
  tradeFeeBps: 100,
} as unknown as LaunchpadPool;

describe("buildBuyQuote exactness vs estimateBuy", () => {
  it("matches estimateBuy raw-for-raw across magnitudes", () => {
    for (const ui of ["0.01", "1", "37.5", "500"]) {
      const raw = BigInt(Math.round(parseFloat(ui) * 1e9));
      const q = buildBuyQuote(POOL, null, ui, 1);
      const est = estimateBuy(POOL, raw, 100);
      expect(q.ok, `quote ok for ${ui}`).toBe(true);
      expect(q.tokensOutRaw).toBe(est.tokensOutRaw.toString());
      expect(q.feeCookRaw).toBe(est.feeRaw.toString());
      expect(q.netCookRaw).toBe(est.netRaw.toString());
    }
  });

  it("min-out floors against the trader at the chosen tolerance", () => {
    const q = buildBuyQuote(POOL, null, "10", 2.5); // 2.5% tolerance
    const est = estimateBuy(POOL, 10_000_000_000n, 100);
    expect(q.minTokensOutRaw).toBe(((est.tokensOutRaw * 9750n) / 10_000n).toString());
  });

  it("enforces pool min/max buy with human errors", () => {
    expect(buildBuyQuote(POOL, null, "0.001", 1).error).toMatch(/minimum buy/);
    expect(buildBuyQuote(POOL, null, "501", 1).error).toMatch(/cap/);
    expect(buildBuyQuote(POOL, null, "abc", 1).error).toMatch(/enter a COOK amount/);
    expect(buildBuyQuote(POOL, null, "", 1).ok).toBe(false);
  });

  it("impact grows with size and levels map to guard colors", () => {
    const small = buildBuyQuote(POOL, null, "0.5", 1);
    const big = buildBuyQuote(POOL, null, "400", 1);
    expect(big.impactPct!).toBeGreaterThan(small.impactPct!);
    expect(small.impactLevel).toBe("safe");
    expect(impactLevel(4)).toBe("warn");
    expect(impactLevel(12)).toBe("danger");
  });

  it("computes the post-trade spot from moved reserves", () => {
    const q = buildBuyQuote(POOL, null, "100", 1);
    expect(q.spotAfterCook!).toBeGreaterThan(q.spotCook);
  });
});

describe("buildSellQuote exactness vs estimateSell", () => {
  const SOLD = {
    ...POOL,
    tokensSold: "100000000000",
    paymentRaisedNet: "40000000000000",
  } as unknown as LaunchpadPool;

  it("matches estimateSell raw-for-raw", () => {
    const q = buildSellQuote(SOLD, null, "1000", 1);
    const est = estimateSell(SOLD, 1_000_000_000n, 100);
    expect(q.grossCookRaw).toBe(est.grossRaw.toString());
    expect(q.feeCookRaw).toBe(est.feeRaw.toString());
    expect(q.netCookRaw).toBe(est.netRaw.toString());
    expect(q.minCookOutRaw).toBe(((est.netRaw * 9900n) / 10_000n).toString());
  });

  it("overselling the position errors instead of quoting", () => {
    const q = buildSellQuote(SOLD, null, "999999999999", 1, 6, 5_000_000_000n); // holds 5,000 shares
    expect(q.ok).toBe(false);
    expect(q.error).toMatch(/6021/);
    const fine = buildSellQuote(SOLD, null, "1000", 1, 6, 5_000_000_000n);
    expect(fine.ok).toBe(true);
  });
});
