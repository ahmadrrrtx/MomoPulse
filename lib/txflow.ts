"use client";

/**
 * The 6-stage transaction flow (H22–24) shared by buy / sell / claim / sweep:
 *
 *   1 build      POST /tx/* → base64 legacy tx
 *   2 guard      sanitize (program allowlist) + assertBlockhashUsable + re-quote vs curve
 *   3 wrap       wCOOK ribbon if the buy needs native→wrapped (pre-tx)
 *   4 sign       Nightly (sponsor feePayer rewrite happens BEFORE this, so the wallet shows it)
 *   5 send       sendRawTransaction
 *   6 confirm    lastValidBlockHeight-bounded confirm → Stage-4 reconcile + explorer link
 *
 * Failures are translated for humans: 6xxx via the table, Anchor errors via log parsing,
 * blockhash expiry gets a Rebuild action, curve-movement gets a re-quote prompt.
 */
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  assertBlockhashUsable,
  deserializeBuilt,
  planWrappedCook,
  sanitizeBuilt,
  sendWrapTx,
  txWrapsInternally,
  verifyExpectation,
} from "@/core/tx";
import {
  anchorLogError,
  anchorLogSummary,
  launchpadErrorMessage,
  programErrorCode,
} from "@/core/errors6xxx";
import { explorerTxUrl } from "@/core/constants";
import { toast, useToasts } from "@/store/toasts";
import {
  fetchBuyTx,
  fetchClaimCreatorFeesTx,
  fetchClaimTx,
  fetchSellTx,
  type BuiltTx,
  type ClaimKind,
} from "@/clients/momoswap";

export type TxKind = "buy" | "sell" | "claim" | "claim_creator_fees";

export interface FlowParams {
  kind: TxKind;
  pool: string;
  wallet: PublicKey;
  /** buy: COOK raw units; sell: shares raw; claim fair: payment raw */
  amountRaw?: string;
  claimKind?: ClaimKind;
  proof?: string[];
  referrer?: string;
  /** relayer/gasless: feePayer rewritten to sponsor before the user signs */
  sponsor?: PublicKey;
  /** current pool phase — buys/sells preflight against it (API does NOT phase-check) */
  phase?: string;
  onReconcile?: () => void;
  /** curve-moved guard: quote-time expected out (raw); rechecked right before signing */
  expectedOutRaw?: string;
  requote?: () => Promise<string | null>;
}

export interface FlowResult {
  ok: boolean;
  sig?: string;
  error?: string;
  stage?: number;
}

const STAGES = [
  "① building transaction",
  "② guarding · sanitize · blockhash · re-quote",
  "③ wrapping COOK → wCOOK",
  "④ awaiting wallet signature",
  "⑤ broadcasting",
  "⑥ confirming · reconciling",
] as const;

/** Client-side guard rails (H24–26): the API will build trades on settled pools — we refuse. */
export function preflightTradeError(phase: string | undefined, kind: TxKind): string | null {
  if (kind !== "buy" && kind !== "sell") return null;
  if (!phase) return null;
  if (phase === "live") return null;
  if (phase === "graduated") return "pool graduated — the curve is closed; claim your SPL tokens from the drawer (6011 not tradeable)";
  if (phase === "ended") return "pool ended before graduation — claim your refund from the drawer (6011 not tradeable)";
  return `pool is ${phase} — trading closed (6011 not tradeable)`;
}

const kindTitle = (k: TxKind) =>
  k === "buy" ? "buy" : k === "sell" ? "sell" : k === "claim" ? "claim" : "claim creator fees";

export async function runTxFlow(
  connection: Connection,
  params: FlowParams,
  signer: { publicKey: PublicKey; signTransaction: <T extends Transaction>(t: T) => Promise<T> },
  programIds: string[] = [],
): Promise<FlowResult> {
  const id = toast.sticky(kindTitle(params.kind), undefined, { stage: STAGES[0] });
  const stage = (s: string, body?: string) => useToasts.getState().update(id, { stage: s, body });
  const finish = (tone: "ok" | "warn" | "bad", title: string, body?: string, action?: { label: string; onClick: () => void }) => {
    useToasts.getState().update(id, { stage: undefined, tone, title, body, action });
    useToasts.getState().expire(id, tone === "ok" ? 12_000 : 14_000);
  };

  try {
    /* ⓪ preflight guard rails — before any network call */
    const pre = preflightTradeError(params.phase, params.kind);
    if (pre) {
      finish("bad", "launchpad 6011 · not tradeable", pre);
      return { ok: false, error: "preflight-6011", stage: 0 };
    }
    /* ① build */
    stage(STAGES[0]);
    const built: BuiltTx = await buildTx(params);

    /* ② guard */
    stage(STAGES[1]);
    const tx = sanitizeBuilt(deserializeBuilt(built.transaction), programIds);
    if (built.expectationFeePayer && tx.feePayer?.toBase58() !== built.expectationFeePayer) {
      finish("bad", "feePayer ≠ server manifest", `decoded ${tx.feePayer?.toBase58()} vs declared ${built.expectationFeePayer}`);
      return { ok: false, error: "manifest-feepayer", stage: 2 };
    }
    if (built.expectation) {
      const manifest = await verifyExpectation(tx, built.expectation);
      if (!manifest.ok) {
        finish("bad", "transaction ≠ server manifest", manifest.why);
        return { ok: false, error: `manifest-mismatch@${manifest.at}`, stage: 2 };
      }
    }
    let height = built.lastValidBlockHeight;
    let blockhash = built.blockhash;
    let usable = await assertBlockhashUsable(connection, height);
    if (!usable.ok) {
      const rebuilt = await buildTx(params); // one silent rebuild
      blockhash = rebuilt.blockhash;
      height = rebuilt.lastValidBlockHeight;
      tx.recentBlockhash = blockhash;
      tx.signatures = [];
      usable = await assertBlockhashUsable(connection, height);
      if (!usable.ok) {
        finish("bad", "blockhash expired", "the chain outran this tx's validity window twice", {
          label: "rebuild & retry",
          onClick: () => void runTxFlow(connection, params, signer, programIds),
        });
        return { ok: false, error: "blockhash-expired", stage: 2 };
      }
    }
    if (params.expectedOutRaw && params.requote) {
      const fresh = await params.requote();
      if (fresh && fresh !== params.expectedOutRaw) {
        finish("warn", "curve moved — re-quote", `expected out changed (${params.expectedOutRaw} → ${fresh}); review the new quote and retry`);
        return { ok: false, error: "curve-moved", stage: 2 };
      }
    }

    /* ③ wrap ribbon (buys paying from native COOK) */
    if (params.kind === "buy" && params.amountRaw && !txWrapsInternally(tx)) {
      stage(STAGES[2]);
      const plan = await planWrappedCook(connection, params.wallet, BigInt(params.amountRaw));
      if (plan.needed) {
        stage(STAGES[2], `wrapping ${Number(plan.wrapRaw) / 1e9} COOK → wCOOK (pre-tx)…`);
        await sendWrapTx(connection, plan, signer);
      }
    }

    /* sponsor rewrite BEFORE user signature — the wallet displays the final feePayer */
    if (params.sponsor) {
      tx.feePayer = params.sponsor;
      tx.signatures = [];
    }
    tx.recentBlockhash = blockhash;

    /* ④ sign */
    stage(STAGES[3]);
    const signed = await signer.signTransaction(tx);

    /* ⑤ send */
    stage(STAGES[4]);
    const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });

    /* ⑥ confirm + reconcile */
    stage(STAGES[5]);
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight: height }, "confirmed");
    params.onReconcile?.();
    finish("ok", `${kindTitle(params.kind)} confirmed ✓`, sig, {
      label: "view on explorer",
      onClick: () => window.open(explorerTxUrl(sig), "_blank"),
    });
    return { ok: true, sig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const t = translateError(msg);
    finish(
      t.rebuild ? "warn" : "bad",
      t.title,
      t.body,
      t.rebuild ? { label: "rebuild & retry", onClick: () => void runTxFlow(connection, params, signer, programIds) } : undefined,
    );
    return { ok: false, error: msg };
  }
}

async function buildTx(p: FlowParams): Promise<BuiltTx> {
  switch (p.kind) {
    case "buy":
      return fetchBuyTx(p.wallet.toBase58(), p.pool, p.amountRaw!, p.referrer);
    case "sell":
      return fetchSellTx(p.wallet.toBase58(), p.pool, p.amountRaw!);
    case "claim":
      return fetchClaimTx(p.claimKind ?? "graduated_tokens", p.wallet.toBase58(), p.pool, p.amountRaw, p.proof);
    case "claim_creator_fees":
      return fetchClaimCreatorFeesTx(p.wallet.toBase58(), p.pool);
  }
}

/** Human translation of program/infra failures (6xxx table → Anchor logs → infra patterns). */
export function translateError(msg: string, logs?: string[] | null): { title: string; body: string; rebuild?: boolean } {
  const blob = `${msg} ${logs?.join(" ") ?? ""}`;
  const code = programErrorCode(blob);
  if (code != null) {
    return {
      title: `launchpad ${code}`,
      body: launchpadErrorMessage(code) ?? "undocumented launchpad error code",
    };
  }
  const ale = anchorLogError(logs ?? null);
  if (ale) return { title: `program error ${anchorLogSummary(ale)}`, body: msg.slice(0, 200) };
  if (/blockhash|block height|expired/i.test(msg))
    return { title: "blockhash expired", body: msg.slice(0, 180), rebuild: true };
  if (/was not confirmed|confirmation timeout|timed out/i.test(msg))
    return {
      title: "confirmation timeout",
      body: "the tx was sent but not confirmed in time — it may still land; check the explorer before retrying",
      rebuild: true,
    };
  if (/refused|rejected|cancelled|user denied|wallet/i.test(msg))
    return { title: "signature rejected", body: "the wallet declined to sign — nothing was sent" };
  if (/insufficient lamports|fee payer|AccountNotFound/i.test(msg))
    return {
      title: "no COOK for gas",
      body: "this wallet can't pay the ~0.000005 COOK fee — use the starter drip (drawer) or a sponsored claim",
    };
  return { title: "transaction failed", body: msg.slice(0, 220) };
}

/* ── gasless sponsored claims (H28–31) ────────────────────────────────────────────────────
 * prepare (eligibility + memo + feePayer rewrite) → user signs → submit (sponsor co-signs).
 * Falls back to the direct path (user pays their own ~5e-6 COOK) when the relayer is
 * unconfigured/low/rate-limited — refusal (422) never falls back: it is a safety verdict.
 */
export interface SponsoredResult extends FlowResult {
  via: "relay" | "direct";
}

export type ClaimFlowParams = FlowParams & { kind: "claim" | "claim_creator_fees" };

export async function runSponsoredClaim(
  connection: Connection,
  params: ClaimFlowParams,
  signer: { publicKey: PublicKey; signTransaction: <T extends Transaction>(t: T) => Promise<T> },
  programIds: string[] = [],
): Promise<SponsoredResult> {
  const id = toast.sticky(`${kindTitle(params.kind)} · gasless`, undefined, { stage: "① building claim" });
  const stage = (s: string, body?: string) => useToasts.getState().update(id, { stage: s, body });
  const done = (tone: "ok" | "warn" | "bad", title: string, body?: string, action?: { label: string; onClick: () => void }) => {
    useToasts.getState().update(id, { stage: undefined, tone, title, body, action });
    useToasts.getState().expire(id, tone === "ok" ? 12_000 : 14_000);
  };
  try {
    stage("① building claim");
    const built = await buildTx(params);
    stage("② relayer eligibility + spend memo");
    const prep = await fetch("/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx: built.transaction, wallet: params.wallet.toBase58() }),
    });
    if (prep.status === 422) {
      const j = await prep.json();
      done("bad", "relay refused", j.error);
      return { ok: false, via: "relay", error: j.error };
    }
    if (!prep.ok) {
      // relayer unavailable → direct path, user pays their own (tiny) fee
      useToasts.getState().dismiss(id);
      const direct = await runTxFlow(connection, params, signer, programIds);
      return { ...direct, via: "direct" };
    }
    const j = (await prep.json()) as { sponsorTx: string; sponsor: string };
    stage("③ signing (fee paid by relayer)");
    const tx = deserializeBuilt(j.sponsorTx);
    const signed = await signer.signTransaction(tx);
    stage("④ sponsor co-signing + broadcasting");
    const sub = await fetch("/api/relay/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tx: Buffer.from(signed.serialize()).toString("base64"),
        wallet: params.wallet.toBase58(),
      }),
    });
    if (!sub.ok) {
      const e = await sub.json();
      done("bad", "relay submit failed", e.error);
      return { ok: false, via: "relay", error: e.error };
    }
    const s = (await sub.json()) as { sig: string; explorer: string };
    stage("⑤ reconciling");
    params.onReconcile?.();
    done("ok", `${kindTitle(params.kind)} confirmed ✓ (0 COOK gas)`, s.sig, {
      label: "view on explorer",
      onClick: () => window.open(s.explorer, "_blank"),
    });
    return { ok: true, sig: s.sig, via: "relay" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const t = translateError(msg);
    done("bad", t.title, t.body);
    return { ok: false, via: "relay", error: msg };
  }
}

/** Claim-all sweeper (H35–36): sequential sponsored claims with a single ribbon toast. */
export async function sweepClaims(
  connection: Connection,
  items: FlowParams[],
  signer: { publicKey: PublicKey; signTransaction: <T extends Transaction>(t: T) => Promise<T> },
  programIdsByPool: Record<string, string>,
  onReconcile: () => void,
): Promise<{ ok: number; failed: number }> {
  const id = toast.sticky("sweeping claims", undefined, { stage: `0 / ${items.length}`, progress: 0 });
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i]!;
    useToasts.getState().update(id, {
      stage: `${i + 1} / ${items.length} · ${kindTitle(p.kind)}`,
      progress: i / items.length,
    });
    const res =
      p.kind === "buy" || p.kind === "sell"
        ? await runTxFlow(connection, p, signer, programIdsByPool[p.pool] ? [programIdsByPool[p.pool]!] : [])
        : await runSponsoredClaim(connection, p as ClaimFlowParams, signer, programIdsByPool[p.pool] ? [programIdsByPool[p.pool]!] : []);
    if (res.ok) ok++;
    else failed++;
  }
  onReconcile();
  useToasts.getState().update(id, {
    stage: undefined,
    progress: 1,
    tone: failed === 0 ? "ok" : "warn",
    title: `sweep complete — ${ok} ok${failed ? `, ${failed} failed` : ""}`,
  });
  useToasts.getState().expire(id, 10_000);
  return { ok, failed };
}
