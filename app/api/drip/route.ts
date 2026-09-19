/**
 * POST /api/drip — Starter Drip (H31–33): 0.05 COOK to a brand-new wallet so it can pay its
 * own gas for wrap/buy pre-txs. ONE per wallet forever, enforced by ON-CHAIN memo scan of
 * the drip ledger (survives cold starts, auditable) + Turnstile + per-IP hourly cap.
 * body: { wallet, turnstile? } → { sig } | 409 already-dripped | 429 | 503
 */
import { NextResponse } from "next/server";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  DRIP_AMOUNT_RAW,
  DRIP_MEMO_PREFIX,
  dripMemoInstruction,
  rateLimited,
} from "@/core/relay/eligibility";
import { clientIp, getConnection, hasBeenDripped, hotWallet, relayerStatus, sponsorHealth, verifyTurnstile } from "@/lib/relay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const status = relayerStatus();
  if (!status.configured) return NextResponse.json({ error: status.reason }, { status: 503 });
  const sponsor = hotWallet()!;
  const connection = getConnection();
  const ip = clientIp(req);

  const body: { wallet?: string; turnstile?: string } = await req.json().catch(() => ({}));
  const walletStr = body.wallet ?? "";
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletStr);
  } catch {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  const ts = await verifyTurnstile(body.turnstile ?? null, ip);
  if (!ts.ok) return NextResponse.json({ error: `humanity check failed: ${ts.reason}`, dev: ts.dev }, { status: 403 });
  if (rateLimited(`drip:ip:${ip}`, 3)) return NextResponse.json({ error: "per-IP drip limit (3/hour)" }, { status: 429 });

  if (await hasBeenDripped(connection, walletStr)) {
    return NextResponse.json({ error: "this wallet was already dripped — the memo ledger says so" }, { status: 409 });
  }

  const health = await sponsorHealth(connection);
  if (health.alarm)
    return NextResponse.json({ error: "drip faucet low on COOK", balanceRaw: health.balanceRaw }, { status: 503 });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction()
    .add(SystemProgram.transfer({ fromPubkey: sponsor.publicKey, toPubkey: wallet, lamports: DRIP_AMOUNT_RAW }))
    .add(dripMemoInstruction(walletStr));
  tx.feePayer = sponsor.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(sponsor);

  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return NextResponse.json({ sig, amount: "0.05", explorer: `https://cookiescan.io/tx/${sig}` });
  } catch (e) {
    return NextResponse.json({ error: `drip broadcast failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
