import { describe, it, expect } from "vitest";
import { answer, detectIntent } from "./copilot";
import type { CopilotSnapshot } from "./copilot";
import type { WalletScanResult } from "@/core/pipeline";
import type { LaunchpadPool } from "@/core/types";

const pool = (over: Partial<LaunchpadPool> = {}) =>
  ({
    pubkey: "p1",
    symbol: "TEST",
    name: "test",
    status: "live",
    expiryMode: "fair",
    paymentRaisedNet: "500000000000",
    graduationTarget: "1000000000000000",
    participantCount: "7",
    tokenMint: "m1",
    virtualPaymentReserve: "360000000000000",
    virtualTokenReserve: "1073000000000000",
    tokensSold: "0",
    ...over,
  }) as unknown as LaunchpadPool;

const scan = {
  positions: [
    {
      pool: "p1",
      symbol: "TEST",
      status: "live",
      sharesUi: "29506.68",
      exitValueUi: "9.801",
      pnlPct: -1.99,
      action: { kind: "sell", reason: "curve live" },
    },
    {
      pool: "p2",
      symbol: "CINU",
      status: "graduated",
      sharesUi: "0.000087",
      exitValueUi: null,
      pnlPct: null,
      action: { kind: "graduated_tokens", reason: "unclaimed SPL" },
    },
  ],
  created: [{ symbol: "BURNT", unclaimedFeesCook: "0.035", pool: "p3", mint: "m3", status: "graduated", unclaimedVestTokens: null }],
  totals: { liveValueCookUi: "9.801", actionsPending: 1 },
} as unknown as WalletScanResult;

const snap: CopilotSnapshot = {
  wallet: "9rj5GEEypdCbJ1W9is4LHeQxg86h9vxSny6pmsxmakni",
  scan,
  balance: { cook: 0, wcook: 0 },
  pools: [pool(), pool({ pubkey: "p4", symbol: "STEPH", paymentRaisedNet: "358000000000000", participantCount: "13" })],
  safetyBySymbol: {
    TEST: {
      mint: "m1",
      program: "x",
      tokenProgramName: "SPL Token",
      mintAuthority: null,
      freezeAuthority: null,
      decimals: 6,
      supply: "1",
      transferHook: { present: false, programId: null },
      impostors: [],
      registryVerified: true,
    },
  },
};

describe("intent detection", () => {
  it("routes the five canned intents", () => {
    expect(detectIntent("what am I holding?")).toBe("holdings");
    expect(detectIntent("anything to claim?")).toBe("claims");
    expect(detectIntent("can I pay gas?")).toBe("gas");
    expect(detectIntent("what's close to graduating?")).toBe("radar");
    expect(detectIntent("is TEST safe?")).toBe("safety");
    expect(detectIntent("hello there")).toBe("unknown");
  });
});

describe("copilot answers", () => {
  it("holdings: summarizes positions with exact exit values", () => {
    const a = answer("show my positions", snap);
    expect(a.text).toContain("2 position(s)");
    expect(a.text).toContain("9.801");
  });

  it("claims: lists claimables + sweep hint", () => {
    const a = answer("anything to claim?", snap);
    expect(a.text).toContain("CINU");
    expect(a.text).toContain("sweep");
    expect(a.text).toContain("creator fees");
  });

  it("gas: broke wallet gets drip + relay advice", () => {
    const a = answer("can I pay gas?", snap);
    expect(a.text).toContain("drip");
    const rich = answer("gas?", { ...snap, balance: { cook: 5, wcook: 0 } });
    expect(rich.text).toContain("yes");
  });

  it("radar: ranks live pools by graduation progress", () => {
    const a = answer("what's close to graduating?", snap);
    expect(a.text.indexOf("STEPH")).toBeLessThan(a.text.indexOf("TEST")); // 35.8% > 0.05%
  });

  it("safety: reads the safety row for a symbol", () => {
    const a = answer("is TEST safe?", snap);
    expect(a.text).toContain("mint renounced ✓");
    expect(a.text).toContain("no hooks ✓");
    expect(a.text).toContain("in registry ✓");
  });

  it("unknown: teaches the five intents", () => {
    expect(answer("ping", snap).text).toContain("five things");
  });
});
