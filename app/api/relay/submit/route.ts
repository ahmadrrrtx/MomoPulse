/**
 * POST /api/relay/submit — gasless SUBMIT: re-assess the user-SIGNED tx (the prepare response
 * is never trusted), verify feePayer==sponsor + claimant signature present, hot-sign as
 * feePayer, broadcast, confirm. Protocol-native partial signing: one legacy tx, two sigs.
 */
import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { assessRelayTx } from "@/core/relay/eligibility";
import { getConnection, hotWallet, relayerStatus } from "@/lib/relay-server";
import { fetchPoolPrograms } from "@/core/decode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function txInstructions(tx: Transaction) {
  return tx.instructions.map((ix) => ({
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner })),
    data: ix.data as unknown as Uint8Array,
  }));
}

export async function POST(req: Request) {
  const status = relayerStatus();
  if (!status.configured) return jsonError(503, status.reason ?? "relayer offline");
  const sponsorKp = hotWallet()!;
  const connection = getConnection();

  const body: { tx?: string; wallet?: string } = await req.json().catch(() => ({}));
  const walletStr = body.wallet ?? "";
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletStr);
  } catch {
    return jsonError(400, "invalid wallet");
  }
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(body.tx ?? "", "base64"));
  } catch {
    return jsonError(400, "undecodable transaction");
  }

  if (tx.feePayer?.toBase58() !== sponsorKp.publicKey.toBase58())
    return jsonError(422, "relay refused: feePayer is not the sponsor");
  const userSig = tx.signatures.find((s) => s.publicKey.toBase58() === walletStr);
  if (!userSig?.signature) return jsonError(422, "relay refused: claimant signature missing");

  const keys = tx.instructions.flatMap((ix) => ix.keys.map((k) => k.pubkey.toBase58()));
  const owners = await fetchPoolPrograms(connection, [...new Set(keys)]);
  const programIds = [...new Set(owners.values())].map((p) => p.toBase58());
  const verdict = assessRelayTx({ programIds, claimant: walletStr, instructions: txInstructions(tx) });
  if (!verdict.ok) return jsonError(422, `relay refused: ${verdict.reason}`);

  tx.sign(sponsorKp); // co-sign as feePayer
  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const height = await connection.getBlockHeight("confirmed");
    await connection.confirmTransaction(
      { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: height + 150 },
      "confirmed",
    );
    return NextResponse.json({ sig, explorer: `https://cookiescan.io/tx/${sig}` });
  } catch (e) {
    return jsonError(502, `broadcast failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
