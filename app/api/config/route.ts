/** GET /api/config — launchpad economics snapshot (admin-tunable; pools override per-field). */
import { NextResponse } from "next/server";
import { fetchLaunchpadConfig } from "@/clients/momoswap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await fetchLaunchpadConfig();
    return NextResponse.json(
      { config, ts: Date.now() },
      { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "config failed", config: null }, { status: 502 });
  }
}
