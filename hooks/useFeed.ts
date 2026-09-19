"use client";

/** Server-state hooks — every poll goes through /api/* (server-side cache keeps the
 * public RPC/API budget flat no matter how many terminals are open). */
import { useQuery } from "@tanstack/react-query";
import type { WalletScanResult } from "@/core/pipeline";
import type { LaunchpadConfig, LaunchpadPool } from "@/core/types";
import type { TradeRow } from "@/app/api/trades/route";

export interface PoolFeedData {
  pools: LaunchpadPool[];
  count: number;
  ts: number;
}

/** Stage-1 pool feed, 5s cadence (H10–13 gate: matches the lobby, faster). */
export function usePoolFeed() {
  return useQuery<PoolFeedData>({
    queryKey: ["pools", "all"],
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
    queryFn: async () => {
      const res = await fetch("/api/pools?status=all");
      if (!res.ok) throw new Error(`pools ${res.status}`);
      return res.json();
    },
  });
}

/** Launchpad config — admin-tunable economics; 60s is plenty, pools snapshot their own. */
export function useLaunchpadConfig() {
  return useQuery<LaunchpadConfig | null>({
    queryKey: ["launchpad-config"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) return null;
      const json = await res.json();
      return json.config ?? null;
    },
  });
}

/** Real fill history for the price chart. */
export function useTrades(pool: string | null) {
  return useQuery<{ trades: TradeRow[]; count: number }>({
    queryKey: ["trades", pool],
    enabled: !!pool,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      const res = await fetch(`/api/trades?pool=${pool}&limit=300`);
      if (!res.ok) throw new Error(`trades ${res.status}`);
      return res.json();
    },
  });
}

/** True positions for a wallet (drawer + entry pins), reconciles on 30s + focus. */
export function useScan(wallet: string | null) {
  return useQuery<WalletScanResult>({
    queryKey: ["scan", wallet],
    enabled: !!wallet,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    queryFn: async () => {
      const res = await fetch(`/api/scan?wallet=${encodeURIComponent(wallet!)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `scan ${res.status}`);
      return json;
    },
  });
}

export interface SafetyReport {
  mint: string;
  program: string | null;
  tokenProgramName: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  decimals: number | null;
  supply: string | null;
  transferHook: { present: boolean; programId: string | null };
  impostors: { mint: string; name: string }[];
  registryVerified: boolean;
}

export function useSafety(mint: string | null, symbol: string | null) {
  return useQuery<SafetyReport>({
    queryKey: ["safety", mint],
    enabled: !!mint,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/safety?mint=${mint}&symbol=${encodeURIComponent(symbol ?? "")}`);
      if (!res.ok) throw new Error(`safety ${res.status}`);
      return res.json();
    },
  });
}

export function useBalance(wallet: string | null) {
  return useQuery<{ cook: number; wcook: number }>({
    queryKey: ["balance", wallet],
    enabled: !!wallet,
    refetchInterval: 10_000,
    queryFn: async () => {
      const res = await fetch(`/api/balance?wallet=${encodeURIComponent(wallet!)}`);
      if (!res.ok) throw new Error(`balance ${res.status}`);
      return res.json();
    },
  });
}

export function useBridgeStatus() {
  return useQuery<{ ok: boolean; ms: number | null }>({
    queryKey: ["bridge-status"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch("/api/bridge-status");
      const json = await res.json();
      return { ok: !!json.ok, ms: json.ms ?? null };
    },
  });
}

export interface TokenMeta {
  name: string | null;
  symbol: string | null;
  description: string | null;
  image: string | null;
}

/** Token artwork/description from IPFS metadata — cached forever per uri (immutable CIDs). */
export function useTokenMeta(uri: string | null | undefined) {
  return useQuery<TokenMeta>({
    queryKey: ["meta", uri],
    enabled: !!uri,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/meta?uri=${encodeURIComponent(uri!)}`);
      if (!res.ok) return { name: null, symbol: null, description: null, image: null };
      return res.json();
    },
  });
}
