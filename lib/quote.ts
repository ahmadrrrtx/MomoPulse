/**
 * Execution-panel quote builder — the ONLY math the trade UI shows, and it is the same
 * BigInt path as the program (estimateBuy/estimateSell from core/curve). Pure + synchronous:
 * recomputes in <1ms on every keystroke, no network.
 */
import { buyImpact, estimateBuy, estimateSell, spotPriceCook } from "@/core/curve";
import { poolTradeFeeBps } from "@/core/fees";
import { rawToUi, uiToRaw } from "@/core/format";
import { C } from "@/core/constants";
import type { LaunchpadConfig, LaunchpadPool } from "@/core/types";

export interface BuyQuote {
  ok: boolean;
  error: string | null;
  /** Exact program math. */
  tokensOutRaw: string | null;
  tokensOutUi: string | null;
  feeCookRaw: string | null;
  feeCookUi: string | null;
  netCookRaw: string | null;
  /** tokensOut × (1 − slippage) — the minimum the tx will accept. */
  minTokensOutRaw: string | null;
  minTokensOutUi: string | null;
  /** Price impact as percent (0.42 = 0.42%). */
  impactPct: number | null;
  impactLevel: "safe" | "warn" | "danger";
  avgPriceCook: number | null; // net COOK / tokens out
  spotCook: number;
  spotAfterCook: number | null;
  feeBps: number;
}

export interface SellQuote {
  ok: boolean;
  error: string | null;
  grossCookRaw: string | null;
  grossCookUi: string | null;
  feeCookRaw: string | null;
  feeCookUi: string | null;
  netCookRaw: string | null;
  netCookUi: string | null;
  minCookOutRaw: string | null;
  minCookOutUi: string | null;
  impactPct: number | null;
  impactLevel: "safe" | "warn" | "danger";
  avgPriceCook: number | null;
  spotCook: number;
  feeBps: number;
}

export const IMPACT_WARN_PCT = 3;
export const IMPACT_DANGER_PCT = 10;

export function impactLevel(pct: number): "safe" | "warn" | "danger" {
  if (pct >= IMPACT_DANGER_PCT) return "danger";
  if (pct >= IMPACT_WARN_PCT) return "warn";
  return "safe";
}

function applySlippageDown(raw: bigint, slippagePct: number): bigint {
  // floor(raw × (10000 − bps) / 10000) — min-out is always rounded AGAINST the trader
  const bps = BigInt(Math.round(slippagePct * 100));
  return (raw * (10_000n - bps)) / 10_000n;
}

export function buildBuyQuote(
  pool: LaunchpadPool,
  cfg: LaunchpadConfig | null,
  uiCook: string,
  slippagePct: number,
  tokenDecimals: number = 6,
): BuyQuote {
  const base: BuyQuote = {
    ok: false,
    error: null,
    tokensOutRaw: null,
    tokensOutUi: null,
    feeCookRaw: null,
    feeCookUi: null,
    netCookRaw: null,
    minTokensOutRaw: null,
    minTokensOutUi: null,
    impactPct: null,
    impactLevel: "safe",
    avgPriceCook: null,
    spotCook: spotPriceCook(pool, C.COOK_DECIMALS, tokenDecimals),
    spotAfterCook: null,
    feeBps: poolTradeFeeBps(pool, cfg),
  };
  let paymentRaw: bigint;
  try {
    paymentRaw = uiToRaw(uiCook.trim(), C.COOK_DECIMALS);
  } catch {
    return { ...base, error: "enter a COOK amount" };
  }
  if (paymentRaw <= 0n) return { ...base, error: "enter a COOK amount" };
  try {
    const minBuy = BigInt(pool.minBuy ?? "0");
    if (minBuy > 0n && paymentRaw < minBuy) {
      return { ...base, error: `pool minimum buy is ${rawToUi(minBuy, C.COOK_DECIMALS)} COOK` };
    }
    const maxBuy = BigInt(pool.maxBuyPerWallet ?? "0");
    if (maxBuy > 0n && paymentRaw > maxBuy) {
      return { ...base, error: `per-wallet cap is ${rawToUi(maxBuy, C.COOK_DECIMALS)} COOK` };
    }
    const est = estimateBuy(pool, paymentRaw, base.feeBps);
    const minOut = applySlippageDown(est.tokensOutRaw, slippagePct);
    const impact = buyImpact(pool, paymentRaw, base.feeBps) * 100;
    // post-trade spot: reserves move by net payment in / tokens out
    const x = BigInt(pool.virtualPaymentReserve) + BigInt(pool.paymentRaisedNet) + est.netRaw;
    const y = BigInt(pool.virtualTokenReserve) - BigInt(pool.tokensSold) - est.tokensOutRaw;
    const spotAfter = y > 0n ? Number(x) / 10 ** C.COOK_DECIMALS / (Number(y) / 10 ** tokenDecimals) : null;
    return {
      ...base,
      ok: true,
      tokensOutRaw: est.tokensOutRaw.toString(),
      tokensOutUi: rawToUi(est.tokensOutRaw, tokenDecimals),
      feeCookRaw: est.feeRaw.toString(),
      feeCookUi: rawToUi(est.feeRaw, C.COOK_DECIMALS),
      netCookRaw: est.netRaw.toString(),
      minTokensOutRaw: minOut.toString(),
      minTokensOutUi: rawToUi(minOut, tokenDecimals),
      impactPct: impact,
      impactLevel: impactLevel(impact),
      avgPriceCook:
        est.tokensOutRaw > 0n
          ? Number(est.netRaw) / 10 ** C.COOK_DECIMALS / (Number(est.tokensOutRaw) / 10 ** tokenDecimals)
          : null,
      spotAfterCook: spotAfter,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "quote failed" };
  }
}

export function buildSellQuote(
  pool: LaunchpadPool,
  cfg: LaunchpadConfig | null,
  uiShares: string,
  slippagePct: number,
  tokenDecimals: number = 6,
  /** The connected wallet's position shares — the program rejects oversells with 6021, so the UI warns first. */
  maxSharesRaw?: bigint,
): SellQuote {
  const base: SellQuote = {
    ok: false,
    error: null,
    grossCookRaw: null,
    grossCookUi: null,
    feeCookRaw: null,
    feeCookUi: null,
    netCookRaw: null,
    netCookUi: null,
    minCookOutRaw: null,
    minCookOutUi: null,
    impactPct: null,
    impactLevel: "safe",
    avgPriceCook: null,
    spotCook: spotPriceCook(pool, C.COOK_DECIMALS, tokenDecimals),
    feeBps: poolTradeFeeBps(pool, cfg),
  };
  let sharesRaw: bigint;
  try {
    sharesRaw = uiToRaw(uiShares.trim(), tokenDecimals);
  } catch {
    return { ...base, error: "enter a share amount" };
  }
  if (sharesRaw <= 0n) return { ...base, error: "enter a share amount" };
  if (maxSharesRaw !== undefined && sharesRaw > maxSharesRaw) {
    return { ...base, error: `you hold ${rawToUi(maxSharesRaw, tokenDecimals)} shares — that sell exceeds your position (program error 6021)` };
  }
  try {
    const est = estimateSell(pool, sharesRaw, base.feeBps);
    const minOut = applySlippageDown(est.netRaw, slippagePct);
    const spotBefore = Number(BigInt(pool.virtualPaymentReserve) + BigInt(pool.paymentRaisedNet)) /
      Number(BigInt(pool.virtualTokenReserve) - BigInt(pool.tokensSold));
    const x = BigInt(pool.virtualPaymentReserve) + BigInt(pool.paymentRaisedNet) - est.grossRaw;
    const y = BigInt(pool.virtualTokenReserve) - BigInt(pool.tokensSold) + sharesRaw;
    const spotAfter = y > 0n ? Number(x) / Number(y) : 0;
    const impact = spotBefore > 0 ? Math.max(0, (1 - spotAfter / spotBefore) * 100) : 0;
    return {
      ...base,
      ok: true,
      grossCookRaw: est.grossRaw.toString(),
      grossCookUi: rawToUi(est.grossRaw, C.COOK_DECIMALS),
      feeCookRaw: est.feeRaw.toString(),
      feeCookUi: rawToUi(est.feeRaw, C.COOK_DECIMALS),
      netCookRaw: est.netRaw.toString(),
      netCookUi: rawToUi(est.netRaw, C.COOK_DECIMALS),
      minCookOutRaw: minOut.toString(),
      minCookOutUi: rawToUi(minOut, C.COOK_DECIMALS),
      impactPct: impact,
      impactLevel: impactLevel(impact),
      avgPriceCook:
        sharesRaw > 0n
          ? Number(est.netRaw) / 10 ** C.COOK_DECIMALS / (Number(sharesRaw) / 10 ** tokenDecimals)
          : null,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "quote failed" };
  }
}
