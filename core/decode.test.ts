/**
 * Golden vectors ported from cookiechain/cookie-mcp (MIT) src/core/launchpad/positions.test.ts.
 * The real on-chain UserPosition `7c4j8hud…` — wallet 9rj5GEEy… on pool 4pZSDRbe… (the MOMO test
 * launch). Its decoded values match what the API reported for the same wallet, pinning BOTH the
 * PDA seeds and the field offsets against silent drift. The pool predates the launchpad redeploy,
 * so its PDAs only reproduce under the program that owned it (fixture detail, passed explicitly).
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

import {
  chunk,
  creatorFeeVaultPda,
  decodeTokenAmount,
  decodeUserPosition,
  userPositionPda,
  USER_POSITION_DISCRIMINATOR,
  LAUNCHPAD_PROGRAM_ID,
} from "./decode";

const GOLDEN_PROGRAM = new PublicKey("7tLQV8D6uUyG9r1nEtQuBMqDb5Nfi9TXxsdVZUtsct2M");
const GOLDEN_POOL = "4pZSDRbeimD86umZM9RGLT3mzcSQxbnohicMQcccn8gy";
const GOLDEN_OWNER = "9rj5GEEypdCbJ1W9is4LHeQxg86h9vxSny6pmsxmakni";
const GOLDEN_PDA = "7c4j8hudvNyuhTef4AoCmK4LECnqBfe1SgnBgWsEcobB";
const GOLDEN_ACCOUNT = Buffer.from(
  "+/jR9VPqERs4wghqHNZGk8ljQZ3R3ufSQRJW7rbycnI2vxfKFdauYoOahxesQupI8fIOxPn9sjEWdgRcpHRK7uaWI7VT" +
    "wpIv3vnYswAAAAAAypo7AAAAAGZnWx0AAAAAAAAA/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "base64",
);

describe("userPositionPda", () => {
  it('derives the on-chain UserPosition address from ["user", pool, owner]', () => {
    expect(userPositionPda(GOLDEN_POOL, GOLDEN_OWNER, GOLDEN_PROGRAM).toBase58()).toBe(GOLDEN_PDA);
  });

  it("accepts PublicKey inputs and is owner-specific", () => {
    expect(
      userPositionPda(new PublicKey(GOLDEN_POOL), new PublicKey(GOLDEN_OWNER), GOLDEN_PROGRAM).toBase58(),
    ).toBe(GOLDEN_PDA);
    expect(
      userPositionPda(GOLDEN_POOL, "FNNVmNtTFhQtcU6Rp554aS5aDaEhhQqvjX9HLFNKoYEZ", GOLDEN_PROGRAM).toBase58(),
    ).not.toBe(GOLDEN_PDA);
  });

  it("is program-scoped: the same seeds under the current deployment are a different address", () => {
    expect(userPositionPda(GOLDEN_POOL, GOLDEN_OWNER, LAUNCHPAD_PROGRAM_ID).toBase58()).not.toBe(
      GOLDEN_PDA,
    );
  });
});

describe("creatorFeeVaultPda", () => {
  it('derives from ["creator_fee_vault", pool] and is pool-specific', () => {
    const a = creatorFeeVaultPda(GOLDEN_POOL, GOLDEN_PROGRAM);
    const b = creatorFeeVaultPda("2HS2Yt5V5fRG2hyaQTRr2HdrP9J8r152CqKdarpzjfy7", GOLDEN_PROGRAM);
    expect(a.toBase58()).not.toBe(b.toBase58());
    expect(PublicKey.isOnCurve(a.toBuffer())).toBe(false); // it IS a PDA
  });
});

describe("decodeUserPosition", () => {
  it("decodes the golden on-chain account exactly as the launchpad API reports it", () => {
    const pos = decodeUserPosition(GOLDEN_ACCOUNT);
    expect(pos).toEqual({
      pool: GOLDEN_POOL,
      owner: GOLDEN_OWNER,
      shares: "3017341406", // 3,017.341406 tokens at 6dp
      totalPaymentIn: "1000000000", // 1 COOK at 9dp
      totalPaymentOut: "492529510", // 0.49252951 COOK back — the 50% sale of the curve test
      claimed: false,
      winnerClaimed: false,
      graduatedTokensClaimed: false,
    });
  });

  it("rejects a wrong discriminator and a short account without throwing", () => {
    const bad = Buffer.from(GOLDEN_ACCOUNT);
    bad[0] = 0;
    expect(decodeUserPosition(bad)).toBeNull();
    expect(decodeUserPosition(GOLDEN_ACCOUNT.subarray(0, 99))).toBeNull();
  });

  it("matches the published discriminator bytes", () => {
    expect([...USER_POSITION_DISCRIMINATOR]).toEqual([251, 248, 209, 245, 83, 234, 17, 27]);
  });
});

describe("decodeTokenAmount", () => {
  it("reads the SPL token account amount at offset 64", () => {
    const acct = Buffer.alloc(165);
    acct.writeBigUInt64LE(123456789n, 64);
    expect(decodeTokenAmount(acct)).toBe(123456789n);
  });

  it("is 0 for absent or short data", () => {
    expect(decodeTokenAmount(null)).toBe(0n);
    expect(decodeTokenAmount(Buffer.alloc(71))).toBe(0n);
  });
});

describe("chunk", () => {
  it("batches at 100 by default and preserves order", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const out = chunk(items);
    expect(out.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(out.flat()).toEqual(items);
  });

  it("handles empty and exact-size inputs", () => {
    expect(chunk([])).toEqual([]);
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });
});
