/**
 * CookieScan API client — REST (/api, /v1 registry) + DAS JSON-RPC 2.0.
 * Endpoints verified live 2026-09-19; CORS is open for all origins (browser-direct is fine).
 */
import { C } from "@/core/constants";
import type { ApiStatus, CookPrice } from "@/core/types";
import { fetchJson } from "./http";

const API = C.DAS_API;

/** Health + COOK price + token counts. */
export async function fetchStatus(): Promise<ApiStatus> {
  return fetchJson<ApiStatus>(`${API}/api/status`, { timeoutMs: 8_000 });
}

/** CA-agnostic COOK price endpoint — stays valid across future mint migrations (per API docs). */
export async function fetchCookPrice(): Promise<CookPrice> {
  const res = await fetchJson<{ success: boolean; data: CookPrice }>(`${API}/api/cook`, {
    timeoutMs: 8_000,
  });
  return res.data;
}

export async function fetchTokenPrice(mint: string): Promise<{
  priceUsd: number;
  priceChange24hPercent?: number;
  volume24hUsd?: number;
} | null> {
  try {
    return await fetchJson(`${API}/api/price/${mint}`, { timeoutMs: 8_000 });
  } catch {
    return null; // a missing price is a state (dead mint), not an error
  }
}

/** Registry search — FLAGS IMPOSTOR MINTS (the safety-layer source). */
export async function searchAssets(q: string): Promise<unknown> {
  return fetchJson(`${API}/v1/assets/search?q=${encodeURIComponent(q)}`, { timeoutMs: 8_000 });
}

export async function fetchTrending(): Promise<unknown> {
  return fetchJson(`${API}/v1/assets/trending`, { timeoutMs: 8_000 });
}

/** Metaplex DAS JSON-RPC 2.0 — same interface as Helius/Phantom/Backpack indexers. */
export async function dasRpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetchJson<{ jsonrpc: string; id: number; result?: T; error?: { code: number; message: string } }>(
    `${API}/`,
    { method: "POST", body: { jsonrpc: "2.0", id: 1, method, params }, timeoutMs: 10_000 },
  );
  if (res.error) throw new Error(`DAS ${method}: ${res.error.message}`);
  return res.result as T;
}

/** Holder concentration source: token accounts for a mint. */
export async function getTokenAccounts(mint: string, limit = 100): Promise<unknown> {
  return dasRpc("getTokenAccounts", { mint, limit });
}
