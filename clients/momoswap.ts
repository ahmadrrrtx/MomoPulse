/**
 * MomoSwap launchpad HTTP client (api.momoswap.fun). Read endpoints return decoded on-chain
 * state; the `tx/*` endpoints (Phase 3) return base64 legacy Transactions, already partial-signed
 * where applicable, with the blockhash set — the caller simulates, adds the wallet signature and
 * sends. Nothing here signs or holds funds.
 *
 * Ported from cookiechain/cookie-mcp (MIT) src/core/launchpad/api.ts @ v0.5.0.
 */
import { C } from "@/core/constants";
import { MomoPulseError } from "@/core/errors";
import type {
  LaunchpadConfig,
  LaunchpadPool,
  LaunchpadPosition,
  PoolPage,
  PoolStatus,
} from "@/core/types";
import { fetchJson, unwrap } from "./http";

const LP = C.MOMO_API;

export async function fetchLaunchpadConfig(): Promise<LaunchpadConfig> {
  const { config } = unwrap(
    await fetchJson<{ config: LaunchpadConfig }>(`${LP}/config`),
    "launchpad config",
  );
  return config;
}

/**
 * Where the next /pools page starts, or null when the walk is done (pure).
 * A `hasMore` with no usable, strictly-advancing cursor would loop forever, so it stops instead:
 * a short list is recoverable, a hung client is not.
 */
export function nextPoolOffset(
  page: Pick<PoolPage, "hasMore" | "nextOffset">,
  requestedOffset: number,
): number | null {
  if (page.hasMore !== true) return null;
  const next = page.nextOffset;
  if (typeof next !== "number" || !Number.isSafeInteger(next) || next <= requestedOffset)
    return null;
  return next;
}

/** Backstop on the page walk: 500 is the server's own limit ceiling → 20k pools covered. */
const MAX_POOL_PAGES = 40;

/**
 * Every pool matching `status`, following pagination when the API pages.
 *
 * `limit` is deliberately NOT sent: omitting it returns the whole filtered set in one round trip.
 * The walk exists because a DEFAULT page size would otherwise silently truncate the list — the
 * position indexer scans this list to discover which pools to check, and a missing page means a
 * position reported as absent, with no error. Offset paging is safe only because the server
 * breaks every sort tie on `pubkey`.
 */
export async function fetchPools(
  status: PoolStatus | "all" = "all",
  fetchImpl: typeof fetchJson = fetchJson,
): Promise<LaunchpadPool[]> {
  const all: LaunchpadPool[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_POOL_PAGES; page++) {
    const query = new URLSearchParams({ status });
    if (offset > 0) query.set("offset", String(offset));
    const res = unwrap(
      await fetchImpl<PoolPage>(`${LP}/pools?${query.toString()}`, {}),
      "launchpad pools",
    );
    all.push(...(res.pools ?? []));
    const next = nextPoolOffset(res, offset);
    if (next === null) return all;
    offset = next;
  }
  return all;
}

export async function fetchPoolByAddress(pool: string): Promise<LaunchpadPool> {
  const res = unwrap(
    await fetchJson<{ pool: LaunchpadPool }>(`${LP}/pools/${pool}`),
    "launchpad pool",
  );
  return res.pool;
}

/** Resolve a token mint to its pool (the API keeps a mint→pool index, falling back to a scan). */
export async function fetchPoolByMint(
  mint: string,
): Promise<{ poolAddress: string; pool: LaunchpadPool }> {
  return unwrap(
    await fetchJson<{ poolAddress: string; pool: LaunchpadPool }>(`${LP}/token/${mint}`),
    "launchpad token",
  );
}

/** A wallet's curve position per the API, or null when it never bought on this pool.
 *  Prefer the on-chain batch read (core/decode.ts) for portfolios; this is the single-pool path. */
export async function fetchPosition(
  pool: string,
  owner: string,
): Promise<LaunchpadPosition | null> {
  try {
    const res = await fetchJson<{ position: LaunchpadPosition | null }>(
      `${LP}/pools/${pool}/position/${owner}`,
    );
    return res.position ?? null;
  } catch (e) {
    if (e instanceof MomoPulseError && /404/.test(e.message)) return null;
    throw e;
  }
}

/** A pool reference is either the pool PDA or the token mint — resolve both to the pool. */
export async function resolvePool(ref: string): Promise<LaunchpadPool> {
  try {
    return await fetchPoolByAddress(ref);
  } catch {
    try {
      return (await fetchPoolByMint(ref)).pool;
    } catch {
      throw new MomoPulseError(
        `no launchpad pool found for "${ref}"`,
        "pass the token mint or the pool address of a MomoSwap launch",
      );
    }
  }
}

/* ── Phase 3: transaction builders — the API returns base64 LEGACY transactions ───────── */

export interface ExpectationIx {
  programId: string;
  accounts: { pubkey: string; signer: boolean; writable: boolean }[];
  /** sha256 hex of the instruction data — the server's declared manifest */
  dataHash: string;
  transfer?: { to: string; lamports: string };
}

export interface BuiltTx {
  /** base64 of a legacy (non-versioned) Transaction, unsigned. */
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  /** server-declared instruction manifest; verified byte-for-byte before signing */
  expectation?: ExpectationIx[];
  /** the feePayer the server intended (must equal the decoded tx's) */
  expectationFeePayer?: string;
}

async function postTx<T extends object>(path: string, body: T): Promise<BuiltTx> {
  const res = await fetchJson<{
    success?: boolean;
    error?: string;
    transactionBase64?: string;
    blockhash?: string;
    lastValidBlockHeight?: number;
    expectation?: { feePayer?: string; instructions?: ExpectationIx[] };
  }>(`${LP}${path}`, { method: "POST", body, timeoutMs: 15_000 });
  const env = unwrap(res, path);
  if (!env.transactionBase64 || !env.blockhash || env.lastValidBlockHeight === undefined) {
    throw new MomoPulseError(`launchpad ${path} returned no transaction`, "retry; the API may be degraded");
  }
  return {
    transaction: env.transactionBase64,
    blockhash: env.blockhash,
    lastValidBlockHeight: env.lastValidBlockHeight,
    expectation: env.expectation?.instructions,
    expectationFeePayer: env.expectation?.feePayer,
  };
}

export type ClaimKind = "fair" | "jackpot" | "survivor" | "graduated_tokens";

export const fetchBuyTx = (buyer: string, pool: string, paymentAmount: number | string, referrer?: string) =>
  postTx("/tx/buy", referrer ? { buyer, pool, paymentAmount, referrer } : { buyer, pool, paymentAmount });

export const fetchSellTx = (seller: string, pool: string, tokenShares: number | string, unwrapSol = false) =>
  postTx("/tx/sell", { seller, pool, tokenShares, unwrap: unwrapSol });

export const fetchClaimTx = (kind: ClaimKind, claimant: string, pool: string, amount?: number | string, proof?: string[]) =>
  postTx("/tx/claim", { kind, claimant, pool, amount, proof });

export const fetchClaimCreatorFeesTx = (creator: string, pool: string) =>
  postTx("/tx/claim-creator-fees", { creator, pool });
