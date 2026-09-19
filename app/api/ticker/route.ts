/**
 * GET /api/ticker — COOK/USD + current slot, proxied server-side (keeps the client free of
 * third-party origins and lets Vercel edge-cache it for 5s).
 */
import { NextResponse } from "next/server";
import { fetchCookPrice } from "@/clients/cookiescan";
import { getConnection } from "@/clients/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let cookUsd: number | null = null;
  let slot: number | null = null;
  try {
    cookUsd = (await fetchCookPrice()).priceUsd;
  } catch {
    /* ticker degrades to null, never 500 */
  }
  try {
    slot = await getConnection().getSlot();
  } catch {
    /* ditto */
  }
  return NextResponse.json(
    { cookUsd, slot, ts: Date.now() },
    { headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=15" } },
  );
}
