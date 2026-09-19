/**
 * Server-side relayer internals: hot wallet custody (env-only), Turnstile verification with
 * an explicit dev-bypass when unconfigured (never silent), sponsor balance alarm.
 */
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getConnection } from "@/clients/rpc";
import { DRIP_MEMO_PREFIX, RELAY_BALANCE_ALARM_RAW } from "@/core/relay/eligibility";

let hot: Keypair | null | undefined;

/** RELAYER_SECRET (base58 secret key). Absent ⇒ relayer/drip are OFF with a clear reason. */
export function hotWallet(): Keypair | null {
  if (hot !== undefined) return hot;
  const secret = process.env.RELAYER_SECRET;
  if (!secret) {
    hot = null;
    return hot;
  }
  try {
    hot = Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    hot = null;
  }
  return hot;
}

export function relayerStatus(): { configured: boolean; sponsor: string | null; reason?: string } {
  const w = hotWallet();
  if (!w) return { configured: false, sponsor: null, reason: "relayer hot wallet unconfigured (set RELAYER_SECRET)" };
  return { configured: true, sponsor: w.publicKey.toBase58() };
}

export async function sponsorHealth(connection: Connection): Promise<{ balanceRaw: string; alarm: boolean }> {
  const w = hotWallet();
  if (!w) return { balanceRaw: "0", alarm: true };
  try {
    const lamports = await connection.getBalance(w.publicKey);
    return { balanceRaw: String(lamports), alarm: BigInt(lamports) < RELAY_BALANCE_ALARM_RAW };
  } catch {
    return { balanceRaw: "0", alarm: true };
  }
}

export interface TurnstileResult {
  ok: boolean;
  dev?: boolean;
  reason?: string;
}

/** Cloudflare Turnstile server verify; explicit dev-bypass ONLY when no secret is configured. */
export async function verifyTurnstile(token: string | null, ip: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, dev: true };
  if (!token) return { ok: false, reason: "turnstile token required" };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip, idempotency_key: `${ip}:${token.slice(0, 24)}` }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return json.success ? { ok: true } : { ok: false, reason: json["error-codes"]?.join(",") ?? "turnstile failed" };
  } catch {
    return { ok: false, reason: "turnstile unreachable — failing closed" };
  }
}

export const clientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

export { getConnection };

/** On-chain truth: has this wallet ever been dripped? Scan the sponsor's recent sigs for the memo. */
export async function hasBeenDripped(connection: Connection, wallet: string): Promise<boolean> {
  const sponsor = hotWallet();
  if (!sponsor) return false;
  try {
    const sigs = await connection.getSignaturesForAddress(sponsor.publicKey, { limit: 100 }, "confirmed");
    const recent = sigs.slice(0, 40);
    const txs = await connection.getParsedTransactions(
      recent.map((s) => s.signature),
      { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    );
    for (const t of txs) {
      if (!t) continue;
      for (const ix of t.transaction.message.instructions) {
        const parsed = ix as unknown as { parsed?: unknown; program?: string; programId?: string; data?: string };
        const memoText =
          typeof parsed.parsed === "string"
            ? parsed.parsed
            : ((parsed.parsed as { memo?: string } | undefined)?.memo ?? undefined);
        if (typeof memoText === "string" && memoText.startsWith(DRIP_MEMO_PREFIX) && memoText.endsWith(wallet)) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false; // scan failure fails OPEN for liveness but the per-IP cap still applies
  }
}

