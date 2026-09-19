/**
 * Transaction pipeline primitives (Phase 3, H22–26).
 *
 * The MomoSwap API returns UNSIGNED LEGACY transactions. Our path:
 *   fetch → deserialize → sanitize → assertBlockhashUsable → [wrap ribbon] → sign (Nightly)
 *   → send → confirm (lastValidBlockHeight-bounded) → Stage-4 reconcile.
 *
 * `simulateSponsored` is the relayer/verification workhorse: rewrite feePayer to the sponsor
 * and simulate with sigVerify:false — this validates the FULL instruction set against live
 * mainnet state without any signature or balance from the claimant. It is also how the
 * e2e harness proves builds are landable before a single COOK is funded.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

import { C } from "./constants";
import { MomoPulseError } from "./errors";

/** base64 → legacy Transaction. The API never sends versioned txs (v0 needs ALTs; pinned ALT exists only for create-pool). */
export function deserializeBuilt(base64: string): Transaction {
  const buf = Buffer.from(base64, "base64");
  const tx = Transaction.from(buf);
  return tx;
}

/**
 * Sanitize a server-built tx before it ever reaches a wallet:
 *  - feePayer must be set (we may rewrite it for sponsorship)
 *  - blockhash present
 *  - no instruction may target programs outside the expected set (launchpad-resolved,
 *    SPL Token/2022, AToken, Memo, System, ComputeBudget) — a compromised API must not
 *    be able to slip a wallet-drainer into a "buy".
 */
const EXPECTED_PROGRAMS = new Set([
  C.WCOOK_MINT && "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCdXgDLGJfcHs",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  C.LAUNCHPAD_PROGRAM_FALLBACK,
  C.LIMIT_ORDER_PROGRAM,
].filter(Boolean) as string[]);

export function sanitizeBuilt(tx: Transaction, extraPrograms: string[] = []): Transaction {
  if (!tx.feePayer) throw new MomoPulseError("built tx has no feePayer", "refuse to sign; rebuild");
  if (!tx.recentBlockhash) throw new MomoPulseError("built tx has no blockhash", "rebuild the transaction");
  const allow = new Set([...EXPECTED_PROGRAMS, ...extraPrograms]);
  for (const ix of tx.instructions) {
    const pid = ix.programId.toBase58();
    if (!allow.has(pid)) {
      throw new MomoPulseError(
        `built tx contains unexpected program ${pid}`,
        "refuse to sign — this is the drain-guard doing its job",
      );
    }
  }
  return tx;
}

async function sha256hex(b: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto unavailable — cannot verify the server manifest");
  const d = await subtle.digest("SHA-256", b as unknown as BufferSource);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Byte-for-byte drain guard: the API publishes an `expectation` manifest (programId +
 * accounts + sha256(data) per instruction). If the decoded transaction deviates ANYWHERE
 * from what the server declared, refuse to sign — a MITM or compromised API cannot slip
 * in an extra instruction or mutate amounts without breaking a hash.
 */
export async function verifyExpectation(
  tx: Transaction,
  expectation: { programId: string; accounts: { pubkey: string }[]; dataHash: string }[],
): Promise<{ ok: boolean; at: number; why: string }> {
  if (tx.instructions.length !== expectation.length)
    return { ok: false, at: -1, why: `instruction count ${tx.instructions.length} ≠ manifest ${expectation.length}` };
  for (let i = 0; i < expectation.length; i++) {
    const ix = tx.instructions[i]!;
    const exp = expectation[i]!;
    if (ix.programId.toBase58() !== exp.programId) return { ok: false, at: i, why: `ix ${i} program ≠ manifest` };
    if (ix.keys.length !== exp.accounts.length) return { ok: false, at: i, why: `ix ${i} account count ≠ manifest` };
    for (let a = 0; a < exp.accounts.length; a++) {
      if (ix.keys[a]!.pubkey.toBase58() !== exp.accounts[a]!.pubkey) return { ok: false, at: i, why: `ix ${i} account ${a} ≠ manifest` };
    }
    const hash = await sha256hex(ix.data as unknown as Uint8Array);
    if (hash !== exp.dataHash) return { ok: false, at: i, why: `ix ${i} data hash ≠ manifest (amounts mutated?)` };
  }
  return { ok: true, at: -1, why: "" };
}

/** True when the tx already wraps native→wCOOK internally (the API builds it into buys). */
export function txWrapsInternally(tx: Transaction): boolean {
  return tx.instructions.some((ix) => ix.programId.toBase58() === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" && ix.data[0] === 17);
}

/** Blockhash freshness: refuse to send (or sign) when we're inside the expiry margin. */
export async function assertBlockhashUsable(
  connection: Connection,
  lastValidBlockHeight: number,
  marginSlots = 8,
): Promise<{ ok: boolean; slot: number; headroom: number }> {
  // Cookie Chain skips slots: blockHeight ≠ slot. Expiry is denominated in BLOCK HEIGHT.
  const height = await connection.getBlockHeight("confirmed");
  const headroom = lastValidBlockHeight - marginSlots - height;
  return { ok: headroom > 0, slot: height, headroom };
}

export interface SimResult {
  ok: boolean;
  err: unknown;
  logs: string[];
  units?: number;
}

/**
 * Simulate WITHOUT signature verification — optionally with a rewritten (sponsor) feePayer.
 * sigVerify:false means balances/signatures of signers aren't checked, so this validates
 * program logic + account state exactly as the runtime would execute it post-funding.
 */
export async function simulateSponsored(
  connection: Connection,
  tx: Transaction,
  sponsorFeePayer?: PublicKey,
): Promise<SimResult> {
  const clone = Transaction.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  if (sponsorFeePayer) clone.feePayer = sponsorFeePayer;
  try {
    // sigVerify:false is only accepted for VersionedTransaction — legacy compiles cleanly
    const vt = new VersionedTransaction(clone.compileMessage());
    const res = await connection.simulateTransaction(vt, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    return { ok: !res.value.err, err: res.value.err, logs: res.value.logs ?? [], units: res.value.unitsConsumed };
  } catch (e) {
    return { ok: false, err: String(e), logs: [] };
  }
}

/** Send + confirm bounded by the tx's own lastValidBlockHeight (cookie-mcp confirmSent semantics). */
export async function sendAndConfirm(
  connection: Connection,
  signed: Transaction,
  lastValidBlockHeight: number,
): Promise<string> {
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(
    { signature: sig, blockhash: signed.recentBlockhash!, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

/* ── wCOOK wrap ribbon (ensureWrappedCook pattern) ───────────────────────────────────────
 * Buys pay in wCOOK (wrapped native). A wallet holding only native COOK needs, in the SAME
 * flow: ATA exists → lamports moved in → syncNative. We prepend those instructions as a
 * SEPARATE pre-tx (the API tx is immutable) and show it as a ribbon stage.
 */
export interface WrapPlan {
  needed: boolean;
  instructions: TransactionInstruction[];
  ata: PublicKey;
  wrapRaw: bigint;
}

const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SPL_TOKEN_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/** PDA [wallet, tokenProgram, mint] under the ATA program (allowOwnerOffCurve=true). */
export function wcookAta(owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_ID.toBuffer(), new PublicKey(C.WCOOK_MINT).toBuffer()],
    ATA_PROGRAM_ID,
  );
  return ata;
}

function ataCreateIdempotent(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SPL_TOKEN_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // 1 = idempotent create
  });
}

function syncNative(ata: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: SPL_TOKEN_ID,
    keys: [{ pubkey: ata, isSigner: false, isWritable: true }],
    data: Buffer.from([17]), // Token instruction: SyncNative
  });
}

export async function planWrappedCook(
  connection: Connection,
  owner: PublicKey,
  wantRaw: bigint,
): Promise<WrapPlan> {
  const ata = wcookAta(owner);
  const bal = await connection
    .getTokenAccountBalance(ata, "confirmed")
    .then((r) => BigInt(r.value.amount))
    .catch(() => 0n);
  const shortfall = wantRaw - bal;
  if (shortfall <= 0n) return { needed: false, instructions: [], ata, wrapRaw: 0n };

  const ixs: TransactionInstruction[] = [
    ataCreateIdempotent(owner, ata, owner, new PublicKey(C.WCOOK_MINT)),
    SystemProgram.transfer({ fromPubkey: owner, toPubkey: ata, lamports: shortfall }),
    syncNative(ata),
  ];
  return { needed: true, instructions: ixs, ata, wrapRaw: shortfall };
}

/** Build+sign+send the wrap pre-tx (user pays their own fee here — it's their lamports moving). */
export async function sendWrapTx(
  connection: Connection,
  plan: WrapPlan,
  signer: { publicKey: PublicKey; signTransaction: <T extends Transaction>(t: T) => Promise<T> },
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(...plan.instructions);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = blockhash;
  const signed = await signer.signTransaction(tx);
  return sendAndConfirm(connection, signed, lastValidBlockHeight);
}
