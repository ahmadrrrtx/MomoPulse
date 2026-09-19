/**
 * MomoPulse indexer — Artifact 3 §3.1, Stages 1–5.
 *
 *   Stage 1 · Pool discovery        HTTP /pools (all statuses — claims hide in graduated/expired)
 *   Stage 2 · Program resolution    RPC getMultipleAccountsInfo(pools) → owner ⇒ programId (cached)
 *   Stage 3 · PDA derivation        pure — ["user", pool, wallet] under each pool's own program
 *   Stage 4 · Batched read          RPC getMultipleAccountsInfo (≤100/call) → decodeUserPosition
 *   Stage 5 · Valuation & action    pure — quoteSell-exact exit values, positionAction CTAs
 *
 * Runs identically in Node (CLI, API routes) and the browser (CORS-open endpoints).
 * Cost: 1 HTTP + (1 + ceil(P/100) + ceil(V/100)) RPC calls per scan.
 */
import type { Connection } from "@solana/web3.js";

import { C } from "./constants";
import { poolPhase } from "./phases";
import {
  buildPositionView,
  creatorVestOutstanding,
  totalsOf,
  type PositionView,
  type PositionsTotals,
} from "./positions";
import {
  chunk,
  creatorFeeVaultPda,
  decodeTokenAmount,
  decodeUserPosition,
  fetchPoolPrograms,
  LAUNCHPAD_PROGRAM_ID,
  userPositionPda,
} from "./decode";
import { fetchLaunchpadConfig, fetchPools } from "@/clients/momoswap";
import type { LaunchpadConfig, LaunchpadPool, LaunchpadPosition, PoolPhase } from "./types";
import { rawToUi } from "./format";

export interface CreatorEntry {
  pool: string;
  mint: string;
  symbol: string;
  status: PoolPhase;
  unclaimedFeesCook: string; // UI units
  /** Vesting is denominated in the LAUNCH token, not COOK. */
  unclaimedVestTokens: string | null;
}

export interface WalletScanResult {
  owner: string;
  poolsScanned: number;
  positions: PositionView[];
  created: CreatorEntry[];
  totals: PositionsTotals;
  /** True-position rows for pools where the wallet holds NO shares but has claimable value. */
  notes: string[];
  programIds: Record<string, string>;
  scannedAt: number;
}

export interface ScanDeps {
  connection: Connection;
  /** Injectable for tests/fixtures. */
  fetchPoolsImpl?: typeof fetchPools;
  fetchConfigImpl?: typeof fetchLaunchpadConfig;
  nowSec?: number;
}

/**
 * Full wallet scan: every launchpad position + creator balance a wallet holds, with exact
 * exit values and next actions. `pools`/`config` can be pre-supplied to reuse a cached Stage 1.
 */
export async function scanWallet(
  owner: string,
  deps: ScanDeps,
  preloaded?: { pools?: LaunchpadPool[]; config?: LaunchpadConfig | null },
): Promise<WalletScanResult> {
  const { connection } = deps;
  const now = deps.nowSec ?? Math.floor(Date.now() / 1000);
  const poolsImpl = deps.fetchPoolsImpl ?? fetchPools;
  const configImpl = deps.fetchConfigImpl ?? fetchLaunchpadConfig;

  // --- Stage 1: discovery (all statuses — a graduated pool hides unclaimed tokens, an expired
  // fair pool hides a refund; scanning only `live` would miss exactly what this product is for)
  const [pools, config] = await Promise.all([
    preloaded?.pools ?? poolsImpl("all"),
    preloaded?.config !== undefined ? preloaded.config : configImpl().catch(() => null),
  ]);
  const tokenDecimals = config?.defaultTokenDecimals ?? 6;

  // --- Stage 2: which deployment owns each pool (immutable; process-cached)
  const programs = await fetchPoolPrograms(
    connection,
    pools.map((p) => p.pubkey),
  );
  const programIds: Record<string, string> = {};
  for (const p of pools) {
    programIds[p.pubkey] = (programs.get(p.pubkey) ?? LAUNCHPAD_PROGRAM_ID).toBase58();
  }

  // --- Stage 3+4: derive PDAs, batch-read, decode (never throws per-account)
  const positionsByPool = new Map<string, LaunchpadPosition>();
  const pdas = pools.map((p) => ({
    pool: p.pubkey,
    pda: userPositionPda(p.pubkey, owner, programs.get(p.pubkey) ?? LAUNCHPAD_PROGRAM_ID),
  }));
  for (const batch of chunk(pdas)) {
    const infos = await connection.getMultipleAccountsInfo(batch.map((b) => b.pda));
    infos.forEach((info, i) => {
      if (!info?.data) return;
      const decoded = decodeUserPosition(info.data);
      if (decoded) positionsByPool.set(batch[i]!.pool, decoded);
    });
  }

  // Creator fee vaults — only for pools this wallet created (saves a batch round-trip otherwise)
  const createdPools = pools.filter((p) => p.creator === owner);
  const vaultBalances = new Map<string, bigint>();
  if (createdPools.length > 0) {
    const vaultPdas = createdPools.map((p) => ({
      pool: p.pubkey,
      pda: creatorFeeVaultPda(p.pubkey, programs.get(p.pubkey) ?? LAUNCHPAD_PROGRAM_ID),
    }));
    for (const batch of chunk(vaultPdas)) {
      const infos = await connection.getMultipleAccountsInfo(batch.map((b) => b.pda));
      infos.forEach((info, i) => vaultBalances.set(batch[i]!.pool, decodeTokenAmount(info?.data)));
    }
  }

  // --- Stage 5: valuation + actions
  const poolByPubkey = new Map(pools.map((p) => [p.pubkey, p]));
  const positions: PositionView[] = [];
  for (const [poolAddr, position] of positionsByPool) {
    const pool = poolByPubkey.get(poolAddr);
    if (!pool) continue;
    positions.push(
      buildPositionView(pool, position, config, tokenDecimals, {
        creatorFeeRaw: pool.creator === owner ? (vaultBalances.get(poolAddr) ?? 0n) : undefined,
        nowSec: now,
      }),
    );
  }
  // Sort: actionable first, then live value desc.
  positions.sort((a, b) => {
    if (!!a.action !== !!b.action) return a.action ? -1 : 1;
    const av = a.exitValueRaw ? BigInt(a.exitValueRaw) : 0n;
    const bv = b.exitValueRaw ? BigInt(b.exitValueRaw) : 0n;
    return bv > av ? 1 : bv < av ? -1 : 0;
  });

  const created: CreatorEntry[] = createdPools.map((p) => {
    const fees = vaultBalances.get(p.pubkey) ?? 0n;
    const vest = creatorVestOutstanding(p);
    return {
      pool: p.pubkey,
      mint: p.tokenMint,
      symbol: p.symbol,
      status: poolPhase(p, now),
      unclaimedFeesCook: rawToUi(fees, C.COOK_DECIMALS),
      unclaimedVestTokens: vest > 0n ? rawToUi(vest, tokenDecimals) : null,
    };
  });

  const notes: string[] = [];
  const zeroShareClaims = positions.filter(
    (v) => v.sharesRaw === "0" && (v.action?.kind === "fair" || v.action?.kind === "winner"),
  );
  if (zeroShareClaims.length > 0) {
    notes.push(`${zeroShareClaims.length} settled pool(s) may still owe you a payout — check claims`);
  }
  if (config?.paused) notes.push("⚠ the launchpad is PAUSED (admin config) — trades will revert with 6000");

  return {
    owner,
    poolsScanned: pools.length,
    positions,
    created,
    totals: totalsOf(positions),
    notes,
    programIds,
    scannedAt: Date.now(),
  };
}
