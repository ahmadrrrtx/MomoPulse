/**
 * GET /api/bridge-status — is the Hyperlane sCOOK↔COOK bridge reachable right now?
 * Server-side probe (browser CORS would lie); latency included so the on-ramp card can
 * say "bridge up · 340ms" instead of a hopeful green dot.
 */
import { NextResponse } from "next/server";
import { C } from "@/core/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  try {
    const res = await fetch(C.BRIDGE, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
    const ms = Date.now() - t0;
    const ok = res.ok || res.status === 404; // SPA roots may 404 on HEAD-less probes; <500 = reachable
    return NextResponse.json(
      { ok, status: res.status, ms, ts: Date.now() },
      { headers: { "cache-control": "public, s-maxage=30" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, status: null, ms: Date.now() - t0, ts: Date.now() },
      { headers: { "cache-control": "public, s-maxage=10" } },
    );
  }
}
