/**
 * GET /api/scan?wallet=<pubkey> — the Stage 1–5 indexer pipeline as an endpoint.
 * Server-side so the browser never needs an RPC connection of its own and the genesis-verified
 * decoders run in Node (identical code path as the CLI). never cached: positions are truth.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/clients/rpc";
import { scanWallet } from "@/core/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet address" }, { status: 400 });
  }
  try {
    const scan = await scanWallet(wallet, { connection: getConnection() });
    return NextResponse.json(scan, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
