/**
 * Pool lifecycle phases. Ported from cookiechain/cookie-mcp (MIT) src/core/launchpad/index.ts.
 *
 * `ended` = on-chain still `Open`/`Created` but past `end_ts`: trading is over and nothing has
 * settled the pool yet, so it is neither tradeable nor claimable (except a Fair refund, which
 * settles the pool itself). The API used to report that window as `live`; deriving it locally
 * keeps the UI honest regardless of which backend build answers.
 */
import { MomoPulseError } from "./errors";
import type { LaunchpadPool, PoolPhase } from "./types";

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function poolPhase(pool: Pick<LaunchpadPool, "status" | "endTs">, nowSec: number): PoolPhase {
  return pool.status === "live" && nowSec > pool.endTs ? "ended" : pool.status;
}

/**
 * Refuse a trade on a pool that cannot take one, with a phase-specific hint. Called before any
 * build/quote so the user is told BEFORE spending a signature prompt.
 */
export function assertTradeable(pool: LaunchpadPool, action: string, nowSec = nowSeconds()): void {
  const phase = poolPhase(pool, nowSec);
  if (phase === "live") return;
  const hint =
    phase === "upcoming"
      ? `trading opens at ${new Date(pool.launchTs * 1000).toISOString()}`
      : phase === "graduated"
        ? "the pool graduated — the token trades on the open market now (Cookiebox / Candy Shop)"
        : phase === "ended"
          ? `the launch window closed at ${new Date(pool.endTs * 1000).toISOString()} and the pool has not been settled on-chain yet — claims open once it is expired`
          : "the launch expired — claim to settle your position";
  throw new MomoPulseError(`cannot ${action}: the pool is ${phase}`, hint);
}

/** Countdown seconds for a phase (ends-in for live, opens-in for upcoming), else null. */
export function phaseCountdownSecs(pool: LaunchpadPool, nowSec = nowSeconds()): number | null {
  const phase = poolPhase(pool, nowSec);
  if (phase === "live") return Math.max(0, pool.endTs - nowSec);
  if (phase === "upcoming") return Math.max(0, pool.launchTs - nowSec);
  return null;
}
