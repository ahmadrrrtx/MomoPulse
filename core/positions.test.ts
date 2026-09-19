import { describe, it, expect } from "vitest";
import {
  positionAction,
  creatorVestOutstanding,
  buildPositionView,
  totalsOf,
} from "./positions";
import type { LaunchpadPool, LaunchpadPosition } from "./types";

const pos = (over: Partial<LaunchpadPosition> = {}): LaunchpadPosition => ({
  pool: "P",
  owner: "O",
  shares: "1000000",
  totalPaymentIn: "1000000000",
  totalPaymentOut: "0",
  claimed: false,
  winnerClaimed: false,
  graduatedTokensClaimed: false,
  ...over,
});

describe("positionAction", () => {
  it("live + shares → sell", () => {
    const a = positionAction({ status: "live", expiryMode: "fair" }, pos());
    expect(a?.tool).toBe("launchpad_sell");
  });

  it("live + zero shares → nothing", () => {
    expect(positionAction({ status: "live", expiryMode: "fair" }, pos({ shares: "0" }))).toBeNull();
  });

  it("ended + fair + unclaimed → claim fair (settles the pool)", () => {
    const a = positionAction({ status: "ended", expiryMode: "fair" }, pos());
    expect(a).toMatchObject({ tool: "claim_launchpad", kind: "fair" });
  });

  it("ended + non-fair → wait for settlement", () => {
    expect(positionAction({ status: "ended", expiryMode: "jackpot" }, pos())).toBeNull();
    expect(positionAction({ status: "ended", expiryMode: "dead" }, pos())).toBeNull();
  });

  it("graduated + unclaimed tokens → claim graduated_tokens", () => {
    const a = positionAction({ status: "graduated", expiryMode: "dead" }, pos());
    expect(a).toMatchObject({ tool: "claim_launchpad", kind: "graduated_tokens" });
  });

  it("graduated + already claimed → nothing", () => {
    expect(
      positionAction(
        { status: "graduated", expiryMode: "dead" },
        pos({ graduatedTokensClaimed: true }),
      ),
    ).toBeNull();
  });

  it("expired + jackpot/survivor + winner unclaimed → claim winner", () => {
    for (const mode of ["jackpot", "survivor"] as const) {
      const a = positionAction({ status: "expired", expiryMode: mode }, pos());
      expect(a).toMatchObject({ tool: "claim_launchpad", kind: "winner" });
    }
  });

  it("expired + fair + already refunded → nothing; dead mode → nothing", () => {
    expect(positionAction({ status: "expired", expiryMode: "fair" }, pos({ claimed: true }))).toBeNull();
    expect(positionAction({ status: "expired", expiryMode: "dead" }, pos())).toBeNull();
  });

  it("upcoming → nothing", () => {
    expect(positionAction({ status: "upcoming", expiryMode: "fair" }, pos())).toBeNull();
  });
});

describe("creatorVestOutstanding", () => {
  it("is total − claimed, never negative", () => {
    expect(creatorVestOutstanding({ creatorVestAmount: "1000", creatorVestClaimed: "400" })).toBe(600n);
    expect(creatorVestOutstanding({ creatorVestAmount: "1000", creatorVestClaimed: "1000" })).toBe(0n);
    expect(creatorVestOutstanding({ creatorVestAmount: "1000", creatorVestClaimed: "1200" })).toBe(0n);
  });
});

// Live-shaped TEST pool (recorded from api.momoswap.fun on 2026-09-19, decimals trimmed).
const TEST_POOL = {
  pubkey: "2HS2Yt5V5fRG2hyaQTRr2HdrP9J8r152CqKdarpzjfy7",
  creator: "AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou",
  tokenMint: "5tgu2QKWJps1gEwVuqWkxFvA83qDz1js2q1tJHXXmomo",
  name: "Test",
  symbol: "TEST",
  status: "live",
  expiryMode: "fair",
  launchTs: 1789749995,
  endTs: 1790354795,
  virtualPaymentReserve: "360000000000000",
  virtualTokenReserve: "1073000000000000",
  tokensSold: "2153",
  paymentRaisedNet: "723",
  graduationTarget: "1000000000000000",
  tradeFeeBps: 100,
  creatorVestAmount: "0",
  creatorVestClaimed: "0",
} as unknown as LaunchpadPool;

describe("buildPositionView", () => {
  it("values a live position with exact quoteSell and computes PnL vs net invested", () => {
    const p = pos({ shares: "2153", totalPaymentIn: "1000000000", totalPaymentOut: "0" });
    const v = buildPositionView(TEST_POOL, p, null, 6, { nowSec: 1789800000 });
    expect(v.status).toBe("live");
    expect(v.exitValueRaw).not.toBeNull();
    // Exit must be less than the 1 COOK put in (curve + fee round against the trader).
    expect(BigInt(v.exitValueRaw!)).toBeLessThan(1_000_000_000n);
    expect(BigInt(v.pnlRaw!)).toBe(BigInt(v.exitValueRaw!) - 1_000_000_000n);
    expect(v.action?.tool).toBe("launchpad_sell");
    expect(v.spotPrice).toBeGreaterThan(0);
  });

  it("nulls the exit value on a graduated pool and switches the action to claim", () => {
    const p = pos({ shares: "2153" });
    const v = buildPositionView({ ...TEST_POOL, status: "graduated" } as LaunchpadPool, p, null, 6);
    expect(v.exitValueRaw).toBeNull();
    expect(v.pnlRaw).toBeNull();
    expect(v.action?.kind).toBe("graduated_tokens");
  });

  it("carries creator fee + vest fields only when supplied", () => {
    const pool = {
      ...TEST_POOL,
      creatorVestAmount: "5000000000",
      creatorVestClaimed: "1000000000",
    } as LaunchpadPool;
    const v = buildPositionView(pool, pos(), null, 6, { creatorFeeRaw: 12345n });
    expect(v.creatorFeeRaw).toBe("12345");
    expect(v.vestRemainingUi).toBe("4000"); // 4e9 raw at 6dp
    const v2 = buildPositionView(TEST_POOL, pos(), null, 6);
    expect(v2.creatorFeeRaw).toBeUndefined();
    expect(v2.vestRemainingRaw).toBeUndefined();
  });
});

describe("totalsOf", () => {
  it("sums exact BigInts across views", () => {
    const a = buildPositionView(TEST_POOL, pos({ shares: "1000", totalPaymentIn: "1000000000" }), null, 6, { nowSec: 1789800000 });
    const b = buildPositionView(TEST_POOL, pos({ shares: "500", totalPaymentIn: "500000000" }), null, 6, { nowSec: 1789800000 });
    const t = totalsOf([a, b]);
    expect(t.investedCookUi).toBe("1.5");
    expect(BigInt(t.liveValueCookRaw)).toBe(BigInt(a.exitValueRaw!) + BigInt(b.exitValueRaw!));
    expect(t.actionsPending).toBe(2);
  });
});
