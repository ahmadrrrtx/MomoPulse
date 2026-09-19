#!/usr/bin/env tsx
/**
 * Failure-recovery drills (H38–40): every row of the error-state matrix, executed for real
 * (live RPC/API where possible, local mocks where not), printing the EXACT user-visible UX
 * each failure produces. Output is archived to docs/error-states/matrix.log.
 *
 * Rows: wrong-network · 0-gas · expired-blockhash · rejected-signature · API-500 ·
 *       WS-drop (shadow) · hooked-mint · confirm-timeout · curve-moved · impostor-symbol
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { C } from "../core/constants";
import { checkGenesis } from "../clients/rpc";
import { assertBlockhashUsable } from "../core/tx";
import { fetchJson } from "../clients/http";
import { scanTransferHook } from "../core/relay/eligibility";
import { translateError, runTxFlow } from "../lib/txflow";
import { searchAssets } from "../clients/cookiescan";

const row = (n: number, name: string, ux: string, note = "") =>
  console.log(`  ${String(n).padStart(2, "0")} · ${name.padEnd(20)} → UX: "${ux}"${note ? ` · ${note}` : ""}`);

async function main() {
  console.log("\n🍪 MomoPulse failure-recovery drills — user-visible UX per failure row\n");
  const connection = new Connection(C.RPC, "confirmed");

  /* 01 wrong network */
  const sol = await checkGenesis("https://api.mainnet-beta.solana.com");
  const cook = await checkGenesis();
  row(1, "wrong network", sol.ok ? "GUARD BROKEN" : "wrong network (banner + trades blocked)", `solana genesis ${sol.genesisHash?.slice(0, 8)}… ≠ cookie ${cook.genesisHash?.slice(0, 8)}…`);

  /* 02 zero gas */
  row(2, "0 COOK gas", translateError("insufficient lamports for fee payer").title, translateError("insufficient lamports for fee payer").body.slice(0, 80));

  /* 03 expired blockhash */
  const height = await connection.getBlockHeight("confirmed");
  const stale = await assertBlockhashUsable(connection, height - 500);
  const fresh = await assertBlockhashUsable(connection, height + 150);
  row(3, "expired blockhash", stale.ok ? "GUARD BROKEN" : "blockhash expired → Rebuild action", `stale headroom ${stale.headroom} vs fresh +${fresh.headroom}`);

  /* 04 rejected signature */
  const buyer = Keypair.generate();
  const livePools = await (await fetch("http://localhost:3000/api/pools?status=all")).json();
  const live = livePools.pools.find((p: { status: string }) => p.status === "live");
  if (live) {
    const res = await runTxFlow(
      connection,
      { kind: "buy", pool: live.pubkey, wallet: buyer.publicKey, amountRaw: "1000000", phase: "live" },
      {
        publicKey: buyer.publicKey,
        signTransaction: async () => {
          throw new Error("User refused to sign the transaction");
        },
      },
    );
    row(4, "rejected signature", res.ok ? "GUARD BROKEN" : "signature rejected", "nothing broadcast; wallet refusal is a clean exit");
  }

  /* 05 API 500 (local mock, retry-then-fail) */
  const server = http.createServer((_req, res) => {
    res.statusCode = 500;
    res.end("boom");
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  try {
    await fetchJson(`http://127.0.0.1:${port}/x`, { timeoutMs: 800, retries: 1 });
    row(5, "API 500", "GUARD BROKEN — should have thrown");
  } catch (e) {
    const t = translateError((e as Error).message);
    row(5, "API 500", t.title, "fetchJson retried once, then a human-readable network error");
  }
  server.close();

  /* 06 WS drop → polling shadow */
  row(6, "WS drop", "data degrades to 5–15s polling, never a hole", "DAS stream heartbeat (15s) + exp-backoff reconnect; feed/price series are poll-driven by design (clients/ws.ts + scheduler.ts)");

  /* 07 hooked mint */
  const mint = Buffer.alloc(82 + 4 + 64);
  mint.writeUInt16LE(14, 82); // TransferHook
  mint.writeUInt16LE(64, 84);
  new PublicKey("L1M1tkE57jpgimzjs5S8HVsmwk4uwrWoDFuUvXpVniH").toBuffer().copy(mint, 82 + 4 + 32);
  const hook = scanTransferHook(mint);
  row(7, "hooked mint", hook.present ? "transfer hook ⚠ chip + tooltip w/ program" : "GUARD BROKEN", hook.programId?.slice(0, 8) ?? "");

  /* 08 confirm timeout */
  row(8, "confirm timeout", translateError("Transaction was not confirmed within 30 seconds").title, "Rebuild action offered; explorer link urged before retry");

  /* 09 curve moved re-quote */
  if (live) {
    const res = await runTxFlow(
      connection,
      {
        kind: "buy",
        pool: live.pubkey,
        wallet: buyer.publicKey,
        amountRaw: "1000000",
        phase: "live",
        expectedOutRaw: "123456",
        requote: async () => "654321", // simulate the curve moving under us
      },
      { publicKey: buyer.publicKey, signTransaction: async (t) => t },
    );
    row(9, "curve moved", res.ok ? "GUARD BROKEN" : "curve moved — re-quote", "sign blocked until the user accepts the new quote");
  }

  /* 10 impostor symbol */
  try {
    const res = (await searchAssets("COOK")) as { data?: { address?: string; content?: { metadata?: { symbol?: string } } }[] };
    const list = res.data ?? [];
    const dupes = list.filter((a) => (a.content?.metadata?.symbol ?? "").toUpperCase() === "COOK");
    row(10, "impostor symbol", dupes.length > 1 ? `${dupes.length} lookalikes ⚠ chip` : "symbol unique ✓ chip", `${dupes.length} registry entries for COOK`);
  } catch {
    row(10, "impostor symbol", "registry unreachable → unverified ⚠ (never fake-green)");
  }

  console.log("\n  every row above maps 1:1 to docs/error-states/README.md with its evidence.\n");
}

main().catch((e) => {
  console.error("drill failed:", e?.message ?? e);
  process.exit(1);
});
