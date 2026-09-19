/**
 * Gasless relayer eligibility engine (H28–31). Pure + unit-tested: the relayer NEVER trusts
 * the client — /api/relay decodes the unsigned transaction and applies:
 *
 *   1. program allowlist   launchpad(s) · SPL Token/2022 · AToken · Memo · System · ComputeBudget
 *   2. action allowlist    launchpad claims · limit-order cancels · ATA create/sync · memo
 *   3. value-out denial    ANY system/token transfer whose source authority is the claimant
 *                          is refused — sponsorship pays FEES, it must never move user value
 *   4. ATA payer rewrite   API-built ATA creates bill the claimant (0 COOK); we repoint the
 *                          payer account at the sponsor, who signs as feePayer anyway
 *
 * Memo ledger: prepared txs carry MemoSq… "MOMOPULSE_RELAY:v1:<wallet>:<epochHour>" so spend
 * is auditable on-chain forever (the ledger survives serverless cold starts).
 */
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";

export const MEMO_PROGRAMS = [
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCdXgDLGJfcHs",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
];
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

export const RELAY_MEMO_PREFIX = "MOMOPULSE_RELAY:v1:";
export const DRIP_MEMO_PREFIX = "MOMOPULSE_DRIP:v1:";

export interface ValueMove {
  kind: "system" | "spl";
  from: string; // source account / authority
  to: string;
  raw: bigint;
}

/** Decode system.Transfer + SPL Transfer/TransferChecked into value movements. */
export function decodeValueMoves(ixs: { programId: string; keys: { pubkey: string; isSigner: boolean }[]; data: Uint8Array }[]): ValueMove[] {
  const moves: ValueMove[] = [];
  for (const ix of ixs) {
    const d = ix.data;
    if (ix.programId === SYSTEM_PROGRAM && d.length >= 12) {
      const tag = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(0, true);
      if (tag === 2) {
        const raw = new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(4, true);
        moves.push({ kind: "system", from: ix.keys[0].pubkey, to: ix.keys[1].pubkey, raw });
      }
    }
    if ((ix.programId === TOKEN_PROGRAM || ix.programId === TOKEN_2022_PROGRAM) && d.length >= 9) {
      const sel = d[0];
      if (sel === 3 && d.length >= 9) {
        // Transfer: [src, dst, authority] + u64
        const raw = new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(1, true);
        moves.push({ kind: "spl", from: ix.keys[2].pubkey, to: ix.keys[1].pubkey, raw });
      } else if (sel === 12 && d.length >= 10) {
        // TransferChecked: [src, mint, dst, authority] + u64 + u8
        const raw = new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(1, true);
        moves.push({ kind: "spl", from: ix.keys[3].pubkey, to: ix.keys[2].pubkey, raw });
      }
    }
  }
  return moves;
}

export interface RelayAssessInput {
  programIds: string[]; // per-pool resolved launchpad programs
  claimant: string;
  instructions: { programId: string; keys: { pubkey: string; isSigner: boolean }[]; data: Uint8Array }[];
}

export interface RelayVerdict {
  ok: boolean;
  reason?: string;
  moves: ValueMove[];
}

export function assessRelayTx(input: RelayAssessInput): RelayVerdict {
  const allow = new Set([
    ...input.programIds,
    TOKEN_PROGRAM,
    TOKEN_2022_PROGRAM,
    ATA_PROGRAM,
    SYSTEM_PROGRAM,
    COMPUTE_BUDGET,
    ...MEMO_PROGRAMS,
    "L1M1tkE57jpgimzjs5S8HVsmwk4uwrWoDFuUvXpVniH", // limit-order cancels
  ]);
  for (const ix of input.instructions) {
    if (!allow.has(ix.programId)) {
      return { ok: false, reason: `program not relayable: ${ix.programId}`, moves: [] };
    }
  }
  const moves = decodeValueMoves(input.instructions);
  for (const m of moves) {
    if (m.from === input.claimant) {
      return { ok: false, reason: `value-out denied: ${m.kind} transfer from the claimant (${m.raw})`, moves };
    }
  }
  return { ok: true, moves };
}

/** Repoint ATA-create payer from a broke claimant to the sponsor (who signs as feePayer). */
export function rewriteAtaPayer(tx: Transaction, claimant: PublicKey, sponsor: PublicKey): number {
  let n = 0;
  const claimantStr = claimant.toBase58();
  for (const ix of tx.instructions as TransactionInstruction[]) {
    if (ix.programId.toBase58() !== ATA_PROGRAM) continue;
    if (ix.keys[0]?.pubkey.toBase58() === claimantStr) {
      ix.keys[0] = { pubkey: sponsor, isSigner: true, isWritable: true };
      n++;
    }
  }
  return n;
}

/** Append the on-chain spend-ledger memo (before user signing — memo is immutable after). */
export function relayMemoInstruction(wallet: string, epochHour: number): TransactionInstruction {
  const memo = new PublicKey(MEMO_PROGRAMS[0]);
  return new TransactionInstruction({
    programId: memo,
    keys: [],
    data: Buffer.from(`${RELAY_MEMO_PREFIX}${wallet}:${epochHour}`, "utf8"),
  });
}

export function dripMemoInstruction(wallet: string): TransactionInstruction {
  const memo = new PublicKey(MEMO_PROGRAMS[0]);
  return new TransactionInstruction({
    programId: memo,
    keys: [],
    data: Buffer.from(`${DRIP_MEMO_PREFIX}${wallet}`, "utf8"),
  });
}

export const epochHour = (ts = Date.now()) => Math.floor(ts / 3_600_000);

/* ── limits ────────────────────────────────────────────────────────────────────────────── */
export const RELAY_PER_WALLET_HOUR = 10;
export const RELAY_PER_IP_HOUR = 30;
export const DRIP_AMOUNT_RAW = 50_000_000n; // 0.05 COOK
export const RELAY_BALANCE_ALARM_RAW = 200_000_000n; // 0.2 COOK — hot wallet low-funds alarm

/** Sliding-window counter; module-scope Map (serverless: per-instance, on-chain memo is truth). */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit: number, windowMs = 3_600_000, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

/** Token-2022 TLV scan for the TransferHook extension (type 14) — safety row + drills. */
const EXT_TRANSFER_HOOK = 14;
export function scanTransferHook(data: Buffer): { present: boolean; programId: string | null } {
  // Token-2022: TLV entries start right after the 82-byte base mint.
  let off = 82;
  for (let i = 0; i < 64 && off + 4 <= data.length; i++) {
    const type = data.readUInt16LE(off);
    const len = data.readUInt16LE(off + 2);
    if (type === EXT_TRANSFER_HOOK) {
      // TransferHook { authority: OptionalNonZeroPubkey(32), program_id: Pubkey(32), … }
      const prog = data.subarray(off + 4 + 32, off + 4 + 64);
      const allZero = prog.every((b) => b === 0);
      return { present: true, programId: allZero ? null : bs58.encode(prog) };
    }
    off += 4 + len;
    if (len === 0 && type === 0 && off === 86) break; // uninitialized TLV tail
  }
  return { present: false, programId: null };
}

