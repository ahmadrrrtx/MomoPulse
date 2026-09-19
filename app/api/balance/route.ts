/**
 * GET /api/balance?wallet=<pubkey> — native COOK (lamports) + wrapped COOK (wCOOK ATA).
 * Powers the drawer's "native balances" row. 5s cache: balances change only on tx.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/clients/rpc";
import { C } from "@/core/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }
  const conn = getConnection();
  let cook = 0;
  let wcook = 0;
  try {
    const [lamports, atas] = await Promise.all([
      conn.getBalance(owner),
      conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(C.WCOOK_MINT) }),
    ]);
    cook = lamports / 1e9;
    wcook = atas.value.reduce((sum, a) => sum + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
  } catch {
    /* degrade to zeros */
  }
  return NextResponse.json(
    { cook, wcook, ts: Date.now() },
    { headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=10" } },
  );
}
