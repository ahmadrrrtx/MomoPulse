/**
 * Per-pool fee resolution. Ported from cookiechain/cookie-mcp (MIT) src/core/launchpad/fees.ts
 * @ v0.5.0, with the 2026-09-19 field note: the backend's pool serializer NOW emits the
 * snapshotted fee fields (verified live), so the pool-first resolution below is load-bearing.
 *
 * A pool keeps the fee schedule it launched with — a later admin `update_config` cannot re-price
 * it. Reading the GLOBAL /config bps for a specific pool is therefore wrong for every pool
 * created before the last retune (historical example: pool SAKURA carried 75 bps while /config
 * reported 100). ALWAYS resolve a pool's fee through here.
 */
import type { LaunchpadConfig, LaunchpadPool } from "./types";

/** The launch default (1%), used only when neither the pool nor /config states a fee. */
export const DEFAULT_TRADE_FEE_BPS = 100;

const BPS_DENOMINATOR = 10_000;

/** The four fee-split shares a pool snapshots. Each is a share OF the trade fee, in bps. */
export type FeeShare = "treasury" | "creator" | "referral" | "buyback";

const SHARE_FIELD: Record<FeeShare, keyof LaunchpadConfig & keyof LaunchpadPool> = {
  treasury: "treasuryFeeBps",
  creator: "creatorFeeBps",
  referral: "referralFeeBps",
  buyback: "buybackFeeBps",
};

/**
 * First candidate that is a usable bps value. Coerces and range-checks rather than relying on
 * `??` alone: a value can arrive as a string (JSON off the wire), and garbage must fall through
 * instead of poisoning a quote with NaN. `0` is a legitimate fee and must be honoured — that
 * rules out `||`. The upper bound is the 100% mathematical ceiling, not the program's policy
 * cap, so a legitimate higher snapshot after a policy change is never discarded.
 */
function firstBps(candidates: unknown[], fallback: number): number {
  for (const c of candidates) {
    if (c === null || c === undefined || c === "") continue;
    // Stricter than `Number(c)`: arrays must not coerce (Number([]) === 0 would silently
    // understate what the chain charges).
    if (typeof c !== "number" && typeof c !== "string") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0 && n <= BPS_DENOMINATOR) return n;
  }
  return fallback;
}

/** The trade fee to quote THIS pool with, in bps. Pool snapshot → global config → 1%. */
export function poolTradeFeeBps(
  pool: Partial<LaunchpadPool> | null | undefined,
  cfg: Partial<LaunchpadConfig> | null | undefined,
): number {
  return firstBps([pool?.tradeFeeBps, cfg?.tradeFeeBps], DEFAULT_TRADE_FEE_BPS);
}

/**
 * One share OF the trade fee for THIS pool, in bps (creator = 3500 means the creator gets 35%
 * *of* the fee, not 35% of the trade). Falls back to 0 — unknown means "don't claim a split".
 */
export function poolFeeShareBps(
  pool: Partial<LaunchpadPool> | null | undefined,
  cfg: Partial<LaunchpadConfig> | null | undefined,
  share: FeeShare,
): number {
  const field = SHARE_FIELD[share];
  return firstBps([pool?.[field], cfg?.[field]], 0);
}
