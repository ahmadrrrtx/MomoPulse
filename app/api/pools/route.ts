/**
 * GET /api/pools?status=all|live — MomoSwap launchpad pool feed via the Stage-1 client
 * (pagination walk + stuck-cursor guard). s-maxage=10 keeps the public RPC/API budget flat
 * no matter how many terminals are open.
 */
import { NextResponse } from "next/server";
import { fetchPools } from "@/clients/momoswap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") === "live" ? "live" : "all";
  try {
    const pools = await fetchPools(status);
    return NextResponse.json(
      { pools, count: pools.length, ts: Date.now() },
      { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message, pools: [] }, { status: 502 });
  }
}
