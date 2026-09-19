#!/usr/bin/env tsx
/**
 * MomoPulse CLI — Phase 1 exit gate.
 * Prints any wallet's TRUE launchpad positions from Cookie Chain mainnet:
 * the pre-graduation curve shares no wallet or explorer shows, valued with the
 * exact on-chain quoteSell math, with the action each position calls for.
 *
 * Usage:
 *   npx tsx scripts/positions.ts <wallet-address-or-.cook> [--json] [--status all|live]
 *
 * Example (the TEST pool creator from the 2026-09-19 live mainnet):
 *   npx tsx scripts/positions.ts AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou
 */
import { Connection, PublicKey } from "@solana/web3.js";

import { C } from "../core/constants";
import { scanWallet } from "../core/pipeline";
import { fetchPools } from "../clients/momoswap";

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const statusIdx = args.indexOf("--status");
  const status = (statusIdx >= 0 ? args[statusIdx + 1] : "all") as "all" | "live";
  const wallet = args.find((a) => !a.startsWith("--") && (statusIdx < 0 || a !== args[statusIdx + 1]));

  if (!wallet) {
    console.error("usage: tsx scripts/positions.ts <wallet-address> [--json] [--status all|live]");
    process.exit(1);
  }
  // Validate the pubkey (a .cook name would need CookOven resolution — Phase 2).
  try {
    new PublicKey(wallet);
  } catch {
    console.error(`invalid wallet address: ${wallet}`);
    process.exit(1);
  }

  const connection = new Connection(C.RPC, "confirmed");
  const t0 = Date.now();
  const pools = await fetchPools(status);
  const scan = await scanWallet(wallet, { connection }, { pools });
  const elapsed = Date.now() - t0;

  if (asJson) {
    console.log(JSON.stringify(scan, null, 2));
    return;
  }

  console.log("");
  console.log("🍪 MomoPulse — True Positions (pre-graduation curve holdings no wallet shows)");
  console.log("─".repeat(78));
  console.log(`wallet:        ${wallet}`);
  console.log(`pools scanned: ${scan.poolsScanned}   round-trips: ~${2 + Math.ceil(scan.poolsScanned / 100)}   elapsed: ${elapsed}ms`);
  console.log(`chain:         ${C.RPC} (genesis-verified layout decoders)`);
  console.log("─".repeat(78));

  if (scan.positions.length === 0 && scan.created.length === 0) {
    console.log("No launchpad positions for this wallet.");
    console.log("(A position exists only after a bonding-curve buy — UserPosition PDA per pool.)");
  }

  for (const v of scan.positions) {
    console.log("");
    console.log(`${v.symbol}  [${v.status}${v.expiryMode !== "dead" ? ` · ${v.expiryMode}` : ""}]  pool ${v.pool.slice(0, 8)}…  program ${(scan.programIds[v.pool] ?? "?").slice(0, 8)}…`);
    console.log(`  shares:        ${v.sharesUi} ${v.symbol}   (curve shares — NOT SPL tokens)`);
    console.log(`  invested:      ${v.investedUi} COOK   withdrawn: ${v.withdrawnUi} COOK`);
    if (v.exitValueUi !== null) {
      console.log(`  exit value:    ${v.exitValueUi} COOK   (exact quoteSell, fee ${v.exitFeeUi})`);
      console.log(`  mark (spot):   ${v.spotValueUi ?? "—"} COOK   spot ${v.spotPrice.toPrecision(6)} COOK/token`);
      const sign = Number(v.pnlRaw ?? 0n) >= 0 ? "+" : "";
      console.log(`  PnL:           ${sign}${v.pnlUi} COOK${v.pnlPct !== null ? ` (${sign}${v.pnlPct.toFixed(2)}%)` : ""}`);
    } else {
      console.log(`  exit value:    — (curve not live; phase=${v.status})`);
    }
    console.log(`  graduation:    ${v.graduationProgressPct.toFixed(4)}%`);
    if (v.action) {
      console.log(`  ▶ ACTION:      ${v.action.tool} [${v.action.kind}] — ${v.action.reason}`);
    }
    if (v.creatorFeeUi && BigInt(v.creatorFeeRaw ?? "0") > 0n) {
      console.log(`  creator fees:  ${v.creatorFeeUi} COOK unclaimed (creator_fee_vault PDA)`);
    }
    if (v.vestRemainingUi) {
      console.log(`  creator vest:  ${v.vestRemainingUi} ${v.symbol} outstanding`);
    }
    console.log(`  links:         ${v.links.poolPage}`);
  }

  if (scan.created.length > 0) {
    console.log("");
    console.log("Pools CREATED by this wallet:");
    for (const c of scan.created) {
      console.log(`  ${c.symbol.padEnd(10)} [${c.status}] fees: ${c.unclaimedFeesCook} COOK${c.unclaimedVestTokens ? ` · vest: ${c.unclaimedVestTokens} tokens` : ""} · ${c.pool}`);
    }
  }

  console.log("");
  console.log("─".repeat(78));
  console.log(
    `TOTALS  invested ${scan.totals.investedCookUi} · withdrawn ${scan.totals.withdrawnCookUi} · live exit value ${scan.totals.liveValueCookUi} COOK · pending actions ${scan.totals.actionsPending}`,
  );
  for (const n of scan.notes) console.log(`note: ${n}`);
  console.log("");
}

main().catch((e) => {
  console.error("scan failed:", e?.message ?? e);
  if (e?.hint) console.error("hint:", e.hint);
  process.exit(1);
});
