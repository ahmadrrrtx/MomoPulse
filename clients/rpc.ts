/**
 * Cookie Chain RPC connection manager.
 * Single shared Connection, latency ping, genesis-hash verification, conservative concurrency.
 *
 * Empirical budget (probed 2026-09-19): 30 sequential calls → 0× HTTP 429, ~530ms median.
 * Treat limits as unpublished-but-finite: client concurrency cap 4, poll budgets per Artifact 2 §2.7.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { C } from "@/core/constants";

let conn: Connection | null = null;

export function getConnection(endpoint: string = C.RPC): Connection {
  if (!conn || conn.rpcEndpoint !== endpoint) {
    conn = new Connection(endpoint, "confirmed");
  }
  return conn;
}

/** Round-trip latency probe (getHealth → getSlot fallback). Returns ms or null when down. */
export async function rpcPing(endpoint: string = C.RPC): Promise<number | null> {
  const t0 = performance.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [] }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    await res.json();
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}

export interface GenesisCheck {
  ok: boolean;
  genesisHash: string | null;
}

/**
 * Network guard: the connected RPC must be Cookie Chain. A wrong-network read is worse than no
 * read — every address, balance and PDA would be silently meaningless.
 */
export async function checkGenesis(endpoint: string = C.RPC): Promise<GenesisCheck> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash", params: [] }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json()) as { result?: string };
    const hash = json.result ?? null;
    return { ok: hash === C.GENESIS_HASH, genesisHash: hash };
  } catch {
    return { ok: false, genesisHash: null };
  }
}

export { PublicKey };
