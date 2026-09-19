import { describe, it, expect } from "vitest";
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import {
  assessRelayTx,
  decodeValueMoves,
  rewriteAtaPayer,
  rateLimited,
  relayMemoInstruction,
  RELAY_MEMO_PREFIX,
  ATA_PROGRAM,
  TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
} from "./eligibility";

const CLAIMANT = "9rj5GEEypdCbJ1W9is4LHeQxg86h9vxSny6pmsxmakni";
const ATTACKER = "AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou";
const VAULT = "4pZSDRbeimD86umZM9RGLT3mzcSQxbnohicMQcccn8gy";
const LAUNCH = "momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw";

function ix(programId: string, keys: string[], data: number[]) {
  return {
    programId,
    keys: keys.map((k) => ({ pubkey: k, isSigner: false })),
    data: Uint8Array.from(data),
  };
}
function splTransfer(src: string, dst: string, authority: string, raw: bigint) {
  const d = new Uint8Array(9);
  d[0] = 3;
  new DataView(d.buffer).setBigUint64(1, raw, true);
  return ix(TOKEN_PROGRAM, [src, dst, authority], Array.from(d));
}
function systemTransfer(from: string, to: string, lamports: bigint) {
  const d = new Uint8Array(12);
  new DataView(d.buffer).setUint32(0, 2, true);
  new DataView(d.buffer).setBigUint64(4, lamports, true);
  return ix(SYSTEM_PROGRAM, [from, to], Array.from(d));
}

describe("assessRelayTx", () => {
  it("accepts a claim shape: launchpad ix + vault→claimant token move + memo", () => {
    const v = assessRelayTx({
      programIds: [LAUNCH],
      claimant: CLAIMANT,
      instructions: [
        ix(LAUNCH, [CLAIMANT, VAULT], [1, 2, 3, 4, 5, 6, 7, 8]),
        splTransfer(VAULT, CLAIMANT, VAULT, 12345n),
        ix("MemoSq4gqABAXKb96qnH8TysNcWxMyWCdXgDLGJfcHs", [], [77, 78]),
      ],
    });
    expect(v.ok).toBe(true);
    expect(v.moves).toHaveLength(1);
  });

  it("denies value-out: system transfer from the claimant", () => {
    const v = assessRelayTx({
      programIds: [LAUNCH],
      claimant: CLAIMANT,
      instructions: [ix(LAUNCH, [CLAIMANT], [1]), systemTransfer(CLAIMANT, ATTACKER, 1_000_000_000n)],
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/value-out denied/);
  });

  it("denies value-out: SPL transfer authorized by the claimant", () => {
    const v = assessRelayTx({
      programIds: [LAUNCH],
      claimant: CLAIMANT,
      instructions: [splTransfer("SomeAta", ATTACKER, CLAIMANT, 999n)],
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/value-out denied/);
  });

  it("denies unknown programs (wallet-drainer guard)", () => {
    const v = assessRelayTx({
      programIds: [LAUNCH],
      claimant: CLAIMANT,
      instructions: [ix("DrainProgram11111111111111111111111111111", [CLAIMANT], [1])],
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/not relayable/);
  });

  it("decodes TransferChecked authority as the value source", () => {
    const d = new Uint8Array(42);
    d[0] = 12;
    new DataView(d.buffer).setBigUint64(1, 5n, true);
    const v = assessRelayTx({
      programIds: [LAUNCH],
      claimant: CLAIMANT,
      instructions: [
        { programId: TOKEN_PROGRAM, keys: ["src", "mint", "dst", CLAIMANT].map((pubkey) => ({ pubkey, isSigner: false })), data: d },
      ],
    });
    expect(v.ok).toBe(false);
  });
});

describe("rewriteAtaPayer", () => {
  it("repoints ATA-create payer from claimant to sponsor", () => {
    const claimant = new PublicKey(CLAIMANT);
    const sponsor = new PublicKey(ATTACKER);
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: new PublicKey(ATA_PROGRAM),
        keys: [
          { pubkey: claimant, isSigner: true, isWritable: true },
          { pubkey: claimant, isSigner: false, isWritable: true },
        ],
        data: Buffer.alloc(0),
      }),
      SystemProgram.transfer({ fromPubkey: sponsor, toPubkey: claimant, lamports: 1n }),
    );
    expect(rewriteAtaPayer(tx, claimant, sponsor)).toBe(1);
    expect(tx.instructions[0].keys[0].pubkey.equals(sponsor)).toBe(true);
    expect(tx.instructions[1].keys[0].pubkey.equals(sponsor)).toBe(true); // untouched
  });
});

describe("rateLimited", () => {
  it("allows up to the limit inside the window, then blocks", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(rateLimited("w1", 10, 3_600_000, now + i)).toBe(false);
    expect(rateLimited("w1", 10, 3_600_000, now + 11)).toBe(true);
    expect(rateLimited("w1", 10, 3_600_000, now + 3_600_001)).toBe(false); // window slid
  });
});

describe("relay memo", () => {
  it("carries wallet + epoch hour for the on-chain spend ledger", () => {
    const ixr = relayMemoInstruction(CLAIMANT, 497175);
    expect(Buffer.from(ixr.data).toString("utf8")).toBe(`${RELAY_MEMO_PREFIX}${CLAIMANT}:497175`);
  });
});
