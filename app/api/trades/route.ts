/**
 * GET /api/trades?pool=<pubkey>&limit=<n> — real fill history from the MomoSwap API
 * (ts, side, trader, price, tokens, payment, sig, marginal). Seeds the price chart with
 * actual history instead of session-only accumulation.
 */
import { NextResponse } from "next/server";
import { fetchJson } from "@/clients/http";
import { C } from "@/core/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TradeRow {
  ts: number;
  side: "buy" | "sell";
  trader: string;
  price: number;
  tokens: number;
  payment: number;
  sig: string;
  marginal: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pool = url.searchParams.get("pool") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200") || 200, 500);
  if (!pool || pool.length < 32) {
    return NextResponse.json({ error: "pool required" }, { status: 400 });
  }
  try {
    const res = await fetchJson<{ success: boolean; count: number; trades: TradeRow[] }>(
      `${C.MOMO_API}/pools/${pool}/trades?limit=${limit}`,
      { timeoutMs: 10_000 },
    );
    const trades = (res.trades ?? []).slice().sort((a, b) => a.ts - b.ts);
    return NextResponse.json(
      { trades, count: trades.length, ts: Date.now() },
      { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "trades fetch failed", trades: [] },
      { status: 502 },
    );
  }
}
