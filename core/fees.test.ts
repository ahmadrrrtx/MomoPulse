import { describe, it, expect } from "vitest";
import { poolTradeFeeBps, poolFeeShareBps, DEFAULT_TRADE_FEE_BPS } from "./fees";
import type { LaunchpadConfig, LaunchpadPool } from "./types";

const cfg = {
  tradeFeeBps: 100,
  treasuryFeeBps: 3000,
  creatorFeeBps: 3500,
  referralFeeBps: 2000,
  buybackFeeBps: 1500,
} as Partial<LaunchpadConfig>;

describe("poolTradeFeeBps", () => {
  it("prefers the pool's own snapshot over the global config (SAKURA case)", () => {
    const pool = { tradeFeeBps: 75 } as Partial<LaunchpadPool>;
    expect(poolTradeFeeBps(pool, cfg)).toBe(75);
  });

  it("falls back to config when the pool omits its snapshot", () => {
    expect(poolTradeFeeBps({} as Partial<LaunchpadPool>, cfg)).toBe(100);
    expect(poolTradeFeeBps(null, cfg)).toBe(100);
  });

  it("honours a legitimate 0 bps (never treats it as missing)", () => {
    expect(poolTradeFeeBps({ tradeFeeBps: 0 }, cfg)).toBe(0);
  });

  it("accepts numeric strings (JSON off the wire)", () => {
    expect(poolTradeFeeBps({ tradeFeeBps: "85" as unknown as number }, cfg)).toBe(85);
  });

  it("falls through on garbage instead of poisoning the quote", () => {
    expect(poolTradeFeeBps({ tradeFeeBps: NaN }, cfg)).toBe(100);
    expect(poolTradeFeeBps({ tradeFeeBps: [] as unknown as number }, cfg)).toBe(100);
    expect(poolTradeFeeBps({ tradeFeeBps: 99999 }, cfg)).toBe(100); // above the 100% ceiling
    expect(poolTradeFeeBps({ tradeFeeBps: -5 }, cfg)).toBe(100);
  });

  it("ends at the 1% launch default when nothing states a fee", () => {
    expect(poolTradeFeeBps(null, null)).toBe(DEFAULT_TRADE_FEE_BPS);
  });
});

describe("poolFeeShareBps", () => {
  it("reads each split share from the pool snapshot first", () => {
    const pool = { creatorFeeBps: 2500, referralFeeBps: 2500 } as Partial<LaunchpadPool>;
    expect(poolFeeShareBps(pool, cfg, "creator")).toBe(2500);
    expect(poolFeeShareBps(pool, cfg, "referral")).toBe(2500);
    expect(poolFeeShareBps(pool, cfg, "treasury")).toBe(3000); // not snapshotted → config
  });

  it("falls back to 0 (don't claim a split) when nothing is known", () => {
    expect(poolFeeShareBps(null, null, "buyback")).toBe(0);
  });
});
