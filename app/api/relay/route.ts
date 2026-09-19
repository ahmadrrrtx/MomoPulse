/**
 * POST /api/relay — gasless PREPARE (H28–31).
 * body: { tx: base64 unsigned legacy tx, wallet: claimant, turnstile?: token }
 *
 *   1. hot wallet + turnstile + per-wallet/per-IP limits
 *   2. decode & assess: program allowlist, action allowlist, VALUE-OUT DENIAL
 *   3. rewrite ATA payer claimant→sponsor; append spend-ledger memo; set feePayer=sponsor
 *   4. return { sponsorTx, sponsor } — the wallet signs THIS (feePayer visible pre-sign)
 *
 * POST /api/relay/submit — { tx: base64 user-signed, wallet } → re-assess (never trust),
 * verify user signature present + feePayer==sponsor → hot-sign → send → confirm → sig.
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  assessRelayTx,
  epochHour,
  rateLimited,
  relayMemoInstruction,
  rewriteAtaPayer,
  RELAY_PER_IP_HOUR,
  RELAY_PER_WALLET_HOUR,
} from "@/core/relay/eligibility";
import { clientIp, getConnection, hotWallet, relayerStatus, sponsorHealth, verifyTurnstile } from "@/lib/relay-server";
import { fetchPoolPrograms } from "@/core/decode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

function txInstructions(tx: Transaction) {
  return tx.instructions.map((ix) => ({
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner })),
    data: ix.data as unknown as Uint8Array,
  }));
}

/** Launchpad programs present in the tx (resolved from pool accounts in the message). */
async function programsForTx(connection: Connection, tx: Transaction): Promise<string[]> {
  const keys = tx.instructions.flatMap((ix) => ix.keys.map((k) => k.pubkey.toBase58()));
  const uniq = [...new Set(keys)];
  const owners = await fetchPoolPrograms(connection, uniq);
  return [...new Set(owners.values())].map((p) => p.toBase58());
}

export async function POST(req: Request) {
  const status = relayerStatus();
  if (!status.configured) return jsonError(503, status.reason ?? "relayer offline");
  const sponsorKp = hotWallet()!;
  const connection = getConnection();

  const ip = clientIp(req);
  let body: { tx?: string; wallet?: string; turnstile?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad json");
  }
  const walletStr = body.wallet ?? "";
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletStr);
  } catch {
    return jsonError(400, "invalid wallet");
  }
  const ts = await verifyTurnstile(body.turnstile ?? null, ip);
  if (!ts.ok) return jsonError(403, `humanity check failed: ${ts.reason}`, { dev: ts.dev });

  if (rateLimited(`relay:w:${walletStr}`, RELAY_PER_WALLET_HOUR))
    return jsonError(429, "per-wallet relay limit reached (10/hour)");
  if (rateLimited(`relay:ip:${ip}`, RELAY_PER_IP_HOUR))
    return jsonError(429, "per-IP relay limit reached (30/hour)");

  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(body.tx ?? "", "base64"));
  } catch {
    return jsonError(400, "undecodable transaction");
  }

  const health = await sponsorHealth(connection);
  if (health.alarm) return jsonError(503, "sponsor hot wallet low on COOK — relayer paused", { balanceRaw: health.balanceRaw });

  const programIds = await programsForTx(connection, tx);
  const verdict = assessRelayTx({ programIds, claimant: walletStr, instructions: txInstructions(tx) });
  if (!verdict.ok) return jsonError(422, `relay refused: ${verdict.reason}`);

  rewriteAtaPayer(tx, wallet, sponsorKp.publicKey);
  tx.add(relayMemoInstruction(walletStr, epochHour()));
  tx.feePayer = sponsorKp.publicKey;
  tx.signatures = [];
  // blockhash freshness is the client's job at submit; keep the API's original hash
  const unsigned = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");

  return NextResponse.json({
    sponsorTx: unsigned,
    sponsor: sponsorKp.publicKey.toBase58(),
    sponsorBalanceAlarm: health.alarm,
    moves: verdict.moves,
  });
}
