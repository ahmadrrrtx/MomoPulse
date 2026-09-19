/**
 * Position → action → view logic. Ported from cookiechain/cookie-mcp (MIT)
 * src/core/launchpad/index.ts (positionAction, creatorVestOutstanding, view shapes), extended
 * with the MomoPulse PositionView merge (Artifact 3 §3.1 Stage 5).
 *
 * Curve shares are not SPL tokens, so "do nothing" is rarely right: after graduation the tokens
 * sit unclaimed, and a Fair expiry leaves a refund on the table. This module answers "what can
 * this holder do RIGHT NOW?" for every (phase × expiryMode × claim-flags) combination.
 *
 * Precision rule: every raw amount travels as a decimal string end-to-end; floats appear only
 * in display fields (spot price, PnL%).
 */
import { estimateSell, spotPriceCook, graduationProgressPct } from "./curve";
import { poolTradeFeeBps } from "./fees";
import { poolPhase } from "./phases";
import { rawToUi } from "./format";
import { C, launchpadPoolUrl, launchpadTokenUrl } from "./constants";
import type {
  ClaimKind,
  ExpiryMode,
  LaunchpadConfig,
  LaunchpadPool,
  LaunchpadPosition,
  PoolPhase,
} from "./types";

/** What the holder can do about a position right now, if anything. */
export interface PositionAction {
  tool: "launchpad_sell" | "claim_launchpad" | "claim_creator_fees";
  kind: ClaimKind | "sell" | "creator_fees";
  reason: string;
}

/**
 * The action a position calls for (pure). Returns null when the position is settled or there is
 * genuinely nothing to collect.
 */
export function positionAction(
  pool: { status: PoolPhase; expiryMode: ExpiryMode },
  position: Pick<
    LaunchpadPosition,
    "shares" | "claimed" | "winnerClaimed" | "graduatedTokensClaimed"
  >,
): PositionAction | null {
  const hasShares = BigInt(position.shares) > 0n;

  // `ended` = trading closed but nobody has settled the pool on-chain yet. Selling always
  // reverts (past end_ts), but a FAIR refund is actionable: claim_fair expires the pool itself.
  if (pool.status === "ended") {
    return hasShares && pool.expiryMode === "fair" && !position.claimed
      ? {
          tool: "claim_launchpad",
          kind: "fair",
          reason:
            "the launch window closed in Fair mode — claiming settles the pool and pays your pro-rata refund",
        }
      : null;
  }
  if (pool.status === "graduated") {
    if (hasShares && !position.graduatedTokensClaimed) {
      return {
        tool: "claim_launchpad",
        kind: "graduated_tokens",
        reason: "the pool graduated and your SPL tokens are still unclaimed",
      };
    }
    return null;
  }
  if (pool.status === "live") {
    return hasShares
      ? {
          tool: "launchpad_sell",
          kind: "sell",
          reason: "the curve is still live — you can sell these shares back to it",
        }
      : null;
  }
  if (pool.status !== "expired") return null;
  if (!hasShares) return null;
  if (pool.expiryMode === "fair" && !position.claimed) {
    return {
      tool: "claim_launchpad",
      kind: "fair",
      reason: "the launch expired in Fair mode — your pro-rata refund is unclaimed",
    };
  }
  if (
    (pool.expiryMode === "jackpot" || pool.expiryMode === "survivor") &&
    !position.winnerClaimed
  ) {
    return {
      tool: "claim_launchpad",
      kind: "winner",
      reason: `the launch expired in ${pool.expiryMode} mode — claim checks whether you placed in the settlement`,
    };
  }
  return null; // dead mode, or already claimed
}

/** Unclaimed creator vesting on a pool this wallet created (pure). Denominated in the LAUNCH token. */
export function creatorVestOutstanding(
  pool: Pick<LaunchpadPool, "creatorVestAmount" | "creatorVestClaimed">,
): bigint {
  const total = BigInt(pool.creatorVestAmount);
  const claimed = BigInt(pool.creatorVestClaimed);
  return total > claimed ? total - claimed : 0n;
}

/** UI-facing merged row. Raw = decimal strings (exact); Ui = display strings. */
export interface PositionView {
  pool: string;
  mint: string;
  symbol: string;
  name: string;
  status: PoolPhase;
  expiryMode: ExpiryMode;
  /** Raw base units. */
  sharesRaw: string;
  investedRaw: string;
  withdrawnRaw: string;
  /** quoteSell-exact COOK if the whole position exited NOW; null unless the curve is live. */
  exitValueRaw: string | null;
  exitFeeRaw: string | null;
  pnlRaw: string | null; // exitValue − (invested − withdrawn)
  /** Display. */
  sharesUi: string;
  investedUi: string;
  withdrawnUi: string;
  exitValueUi: string | null;
  exitFeeUi: string | null;
  /** shares × spot (float, display-only contrast vs exitValue: "mark vs realizable"). */
  spotValueUi: string | null;
  pnlUi: string | null;
  pnlPct: number | null;
  spotPrice: number;
  graduationProgressPct: number;
  action: PositionAction | null;
  /** Present only when the connected wallet created this pool. */
  creatorFeeRaw?: string;
  creatorFeeUi?: string;
  /** Creator vesting outstanding, in the LAUNCH token (not COOK). Only when this wallet created the pool. */
  vestRemainingRaw?: string;
  vestRemainingUi?: string;
  links: { launchpad: string; token: string; poolPage: string };
}

export function buildPositionView(
  pool: LaunchpadPool,
  position: LaunchpadPosition,
  cfg: LaunchpadConfig | null,
  tokenDecimals: number,
  opts?: { creatorFeeRaw?: bigint; nowSec?: number },
): PositionView {
  const phase = poolPhase(pool, opts?.nowSec ?? Math.floor(Date.now() / 1000));
  const feeBps = poolTradeFeeBps(pool, cfg);
  const payDec = C.COOK_DECIMALS;
  const tokDec = tokenDecimals;

  const shares = BigInt(position.shares);
  const invested = BigInt(position.totalPaymentIn);
  const withdrawn = BigInt(position.totalPaymentOut);
  const netIn = invested - withdrawn;

  let exitValueRaw: string | null = null;
  let exitFeeRaw: string | null = null;
  let spotValueUi: string | null = null;
  if (phase === "live" && shares > 0n) {
    const est = estimateSell(pool, shares, feeBps);
    exitValueRaw = est.netRaw.toString();
    exitFeeRaw = est.feeRaw.toString();
    spotValueUi = ((Number(shares) / 10 ** tokDec) * spotPriceCook(pool, payDec, tokDec)).toFixed(
      Math.min(payDec, 6),
    );
  }

  const pnlRaw = exitValueRaw !== null ? (BigInt(exitValueRaw) - netIn).toString() : null;
  const pnlPct = pnlRaw !== null && netIn > 0n ? (Number(BigInt(pnlRaw)) / Number(netIn)) * 100 : null;

  const vest = creatorVestOutstanding(pool);
  const view: PositionView = {
    pool: pool.pubkey,
    mint: pool.tokenMint,
    symbol: pool.symbol,
    name: pool.name,
    status: phase,
    expiryMode: pool.expiryMode,
    sharesRaw: position.shares,
    investedRaw: position.totalPaymentIn,
    withdrawnRaw: position.totalPaymentOut,
    exitValueRaw,
    exitFeeRaw,
    pnlRaw,
    sharesUi: rawToUi(shares, tokDec),
    investedUi: rawToUi(invested, payDec),
    withdrawnUi: rawToUi(withdrawn, payDec),
    exitValueUi: exitValueRaw !== null ? rawToUi(exitValueRaw, payDec) : null,
    exitFeeUi: exitFeeRaw !== null ? rawToUi(exitFeeRaw, payDec) : null,
    spotValueUi,
    pnlUi: pnlRaw !== null ? rawToUi(pnlRaw, payDec) : null,
    pnlPct,
    spotPrice: spotPriceCook(pool, payDec, tokDec),
    graduationProgressPct: graduationProgressPct(pool.paymentRaisedNet, pool.graduationTarget),
    action: positionAction({ status: phase, expiryMode: pool.expiryMode }, position),
    links: {
      launchpad: launchpadTokenUrl(pool.tokenMint),
      token: launchpadTokenUrl(pool.tokenMint),
      poolPage: launchpadPoolUrl(pool.pubkey),
    },
  };

  if (opts?.creatorFeeRaw !== undefined) {
    view.creatorFeeRaw = opts.creatorFeeRaw.toString();
    view.creatorFeeUi = rawToUi(opts.creatorFeeRaw, payDec);
    // Vest fields belong to the pool's CREATOR — only surface them when this wallet is that
    // creator (signalled by creatorFeeRaw being supplied; pipeline gates it on pool.creator).
    if (vest > 0n) {
      view.vestRemainingRaw = vest.toString();
      view.vestRemainingUi = rawToUi(vest, tokDec);
    }
  }
  return view;
}

export interface PositionsTotals {
  investedCookRaw: string;
  withdrawnCookRaw: string;
  /** Sum of quoteSell-exact exit values across live pools (raw COOK). */
  liveValueCookRaw: string;
  unclaimedCreatorFeesRaw: string;
  actionsPending: number;
  investedCookUi: string;
  withdrawnCookUi: string;
  liveValueCookUi: string;
  unclaimedCreatorFeesUi: string;
}

/** Exact BigInt totals over views (no float round-trips). */
export function totalsOf(views: PositionView[]): PositionsTotals {
  let invested = 0n;
  let withdrawn = 0n;
  let liveValue = 0n;
  let fees = 0n;
  let actions = 0;
  for (const v of views) {
    invested += BigInt(v.investedRaw);
    withdrawn += BigInt(v.withdrawnRaw);
    if (v.exitValueRaw !== null) liveValue += BigInt(v.exitValueRaw);
    if (v.creatorFeeRaw) fees += BigInt(v.creatorFeeRaw);
    if (v.action) actions += 1;
  }
  return {
    investedCookRaw: invested.toString(),
    withdrawnCookRaw: withdrawn.toString(),
    liveValueCookRaw: liveValue.toString(),
    unclaimedCreatorFeesRaw: fees.toString(),
    actionsPending: actions,
    investedCookUi: rawToUi(invested, C.COOK_DECIMALS),
    withdrawnCookUi: rawToUi(withdrawn, C.COOK_DECIMALS),
    liveValueCookUi: rawToUi(liveValue, C.COOK_DECIMALS),
    unclaimedCreatorFeesUi: rawToUi(fees, C.COOK_DECIMALS),
  };
}
