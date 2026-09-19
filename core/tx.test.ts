/** Drain-guard tests: the server manifest must match the decoded tx byte-for-byte. */
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { txWrapsInternally, verifyExpectation } from "./tx";

const A = new PublicKey("9rj5GEEypdCbJ1W9is4LHeQxg86h9vxSny6pmsxmakni");
const B = new PublicKey("AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou");
const h = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function txWith(data: Buffer) {
  return new Transaction().add(
    new TransactionInstruction({ programId: SystemProgram.programId, keys: [{ pubkey: A, isSigner: true, isWritable: true }, { pubkey: B, isSigner: false, isWritable: true }], data }),
  );
}
function manifestFor(data: Buffer) {
  return [{ programId: SystemProgram.programId.toBase58(), accounts: [{ pubkey: A.toBase58() }, { pubkey: B.toBase58() }], dataHash: h(data) }];
}

describe("verifyExpectation", () => {
  it("accepts an exact match", async () => {
    const data = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    const v = await verifyExpectation(txWith(data), manifestFor(data));
    expect(v.ok).toBe(true);
  });

  it("rejects mutated amounts (1 lamport flip)", async () => {
    const data = Buffer.from([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    const tampered = Buffer.from(data);
    tampered[4] = 2; // attacker raises the transfer amount
    const v = await verifyExpectation(txWith(tampered), manifestFor(data));
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/data hash/);
  });

  it("rejects an extra smuggled instruction", async () => {
    const data = Buffer.from([1]);
    const tx = txWith(data).add(
      new TransactionInstruction({ programId: SystemProgram.programId, keys: [], data: Buffer.from([9, 9]) }),
    );
    const v = await verifyExpectation(tx, manifestFor(data));
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/count/);
  });

  it("rejects swapped accounts", async () => {
    const data = Buffer.from([3]);
    const v = await verifyExpectation(txWith(data), [
      { programId: SystemProgram.programId.toBase58(), accounts: [{ pubkey: B.toBase58() }, { pubkey: A.toBase58() }], dataHash: h(data) },
    ]);
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/account 0/);
  });
});

describe("txWrapsInternally", () => {
  it("detects syncNative (selector 17) on the Token program inside API-built buys", () => {
    const syncNative = new Transaction().add(
      new TransactionInstruction({ programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), keys: [{ pubkey: A, isSigner: false, isWritable: true }], data: Buffer.from([17]) }),
    );
    expect(txWrapsInternally(syncNative)).toBe(true);
    expect(txWrapsInternally(txWith(Buffer.from([3, 1, 2])))).toBe(false); // system ix, not token
  });
});
