#!/usr/bin/env tsx
/**
 * Phase 3 E2E verification harness (live mainnet, no funds required).
 *
 *   A · buy build      POST /tx/buy with a FUNDED buyer (the sim sponsor) → deserialize →
 *                      sanitize → manifest verify (sha256 per ix) → blockhash (BLOCK HEIGHT)
 *   B · sponsored sim  sigVerify:false — validates the exact instruction set against live state
 *   C · claim path     scan a real wallet for a pending claim → build → sim → relay verdict
 *   D · chaos          preflight guard on a settled pool → clean 6011 UX (the API itself
 *                      happily builds trades on ended pools — we refuse client-side)
 *   E · relayer/drip   posture (503 with reason when unfunded — honest, not fake-green)
 *
 * A landing signature requires a funded wallet in a real browser (Nightly) — see README
 * "Phase 3 runbook". This harness proves every stage up to signature collection.
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { C } from "../core/constants";
import { assertBlockhashUsable, deserializeBuilt, sanitizeBuilt, simulateSponsored, txWrapsInternally, verifyExpectation } from "../core/tx";
import { assessRelayTx, rewriteAtaPayer } from "../core/relay/eligibility";
import { fetchBuyTx, fetchClaimTx, fetchPools } from "../clients/momoswap";
import { fetchPoolPrograms } from "../core/decode";
import { scanWallet } from "../core/pipeline";
import { preflightTradeError, translateError } from "../lib/txflow";

const SPONSOR = new PublicKey("AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou"); // funded TEST creator
const CLAIMANT = new PublicKey("8J1icStkgmp3brTwmKnAAsP4cLgzo4fHuMwJZLZ15C34"); // has pending claims

const ok = (s: string) => console.log(`  ✅ ${s}`);
const bad = (s: string) => console.log(`  ❌ ${s}`);

async function main() {
  const connection = new Connection(C.RPC, "confirmed");
  console.log("\n🍪 MomoPulse Phase-3 E2E harness (live mainnet, no funds needed)");
  console.log(`   buyer & sim sponsor: ${SPONSOR.toBase58()}\n`);

  const pools = await fetchPools("all");
  const live = pools.find((p) => p.status === "live");
  const ended = pools.find((p) => p.status === "ended" || p.status === "expired");
  if (!live) throw new Error("no live pool to test against");

  /* A · build + sanitize + manifest + blockhash */
  console.log(`A · build buy on ${live.symbol} (${live.pubkey.slice(0, 8)}…) for 0.001 COOK`);
  const buy = await fetchBuyTx(SPONSOR.toBase58(), live.pubkey, 1_000_000);
  const buyTx = sanitizeBuilt(deserializeBuilt(buy.transaction));
  ok(`deserialized legacy tx: ${buyTx.instructions.length} instructions`);
  if (buy.expectation) {
    const man = await verifyExpectation(buyTx, buy.expectation);
    man.ok ? ok(`manifest verified byte-for-byte (${buy.expectation.length} ix sha256 hashes match)`) : bad(`manifest mismatch: ${man.why}`);
  } else bad("API returned no expectation manifest");
  if (buy.expectationFeePayer === buyTx.feePayer?.toBase58()) ok("feePayer matches manifest");
  txWrapsInternally(buyTx) ? ok("API wraps COOK→wCOOK inside the buy tx (ribbon skipped)") : bad("no internal wrap detected");

  const usable = await assertBlockhashUsable(connection, buy.lastValidBlockHeight);
  usable.ok ? ok(`blockhash fresh: +${usable.headroom} block-height headroom`) : bad(`blockhash stale (${usable.headroom})`);

  /* B · sponsored simulation */
  console.log("B · sponsored simulation (sigVerify:false, buyer IS the funded sponsor)");
  const sim = await simulateSponsored(connection, buyTx, SPONSOR);
  if (sim.ok) ok(`simulation SUCCESS — units=${sim.units ?? "?"}; instruction set valid against live mainnet state`);
  else {
    bad(`simulation failed: ${JSON.stringify(sim.err)}`);
    sim.logs.slice(-5).forEach((l) => console.log(`     │ ${l}`));
  }

  /* C · claim path via real scan */
  console.log(`\nC · scan ${CLAIMANT.toBase58().slice(0, 8)}… for a pending claim`);
  const scan = await scanWallet(CLAIMANT.toBase58(), { connection });
  const claimable = scan.positions.find((v) => v.action?.kind === "graduated_tokens" || v.action?.kind === "fair");
  if (!claimable) {
    console.log("  ⚠️ no pending claim on this wallet right now — skipping claim sim");
  } else {
    console.log(`   → ${claimable.symbol} [${claimable.status}] action=${claimable.action?.kind}`);
    try {
      const claim = await fetchClaimTx(
        claimable.action!.kind === "fair" ? "fair" : "graduated_tokens",
        CLAIMANT.toBase58(),
        claimable.pool,
        claimable.action!.kind === "fair" ? (BigInt(claimable.investedRaw) - BigInt(claimable.withdrawnRaw)).toString() : undefined,
      );
      const claimTx = sanitizeBuilt(deserializeBuilt(claim.transaction));
      if (claim.expectation) {
        const man = await verifyExpectation(claimTx, claim.expectation);
        man.ok ? ok("claim manifest verified") : bad(`claim manifest: ${man.why}`);
      }
      const cSim = await simulateSponsored(connection, claimTx, SPONSOR);
      cSim.ok ? ok(`claim simulation SUCCESS (units=${cSim.units ?? "?"})`) : bad(`claim sim: ${JSON.stringify(cSim.err)}\n     │ ${cSim.logs.slice(-3).join("\n     │ ")}`);
      rewriteAtaPayer(claimTx, CLAIMANT, SPONSOR);
      const owners = await fetchPoolPrograms(connection, [claimable.pool]);
      const verdict = assessRelayTx({
        programIds: [...new Set(owners.values())].map((p) => p.toBase58()),
        claimant: CLAIMANT.toBase58(),
        instructions: claimTx.instructions.map((ix) => ({
          programId: ix.programId.toBase58(),
          keys: ix.keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner })),
          data: ix.data as unknown as Uint8Array,
        })),
      });
      verdict.ok
        ? ok(`relay eligibility: RELAYABLE — sponsor can pay gas for this claim`)
        : bad(`relay eligibility refused: ${verdict.reason}`);
    } catch (e) {
      const t = translateError((e as Error).message);
      console.log(`  ⚠️ claim build refused → [${t.title}] ${t.body.slice(0, 110)}`);
    }
  }

  /* D · chaos: settled pool preflight */
  if (ended) {
    console.log(`\nD · chaos: trade attempt on ${ended.status} pool ${ended.symbol}`);
    const err = preflightTradeError(ended.status, "buy");
    err ? ok(`preflight refused with clean UX → [launchpad 6011] ${err.slice(0, 100)}`) : bad("preflight let a settled-pool trade through");
  }

  /* E · relayer posture */
  console.log("\nE · relayer posture");
  try {
    const relay = await fetch("http://localhost:3000/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx: "", wallet: SPONSOR.toBase58() }),
    });
    const j = (await relay.json()) as { error?: string };
    console.log(`  · /api/relay → HTTP ${relay.status}: ${j.error ?? "ok"}`);
  } catch {
    console.log("  · /api/relay unreachable (dev server down?)");
  }
  console.log("  · to land real txs: fund a Nightly wallet (buy/sell) or set RELAYER_SECRET + ≥0.2 COOK (sponsored claims + drip)");
  console.log("");
}

main().catch((e) => {
  console.error("harness failed:", e?.message ?? e);
  process.exit(1);
});
