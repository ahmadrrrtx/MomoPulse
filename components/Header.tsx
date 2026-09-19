"use client";

/**
 * Terminal header: brand · COOK ticker · RPC ping · genesis guard · positions drawer trigger ·
 * wallet. Compresses to brand + guard + wallet under 640px (the rest lives in the drawer/feed).
 */
import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRpcPing } from "@/hooks/useRpcPing";
import { useWalletGuard } from "@/hooks/useWalletGuard";
import { useScan } from "@/hooks/useFeed";
import { useTerminal } from "@/store/terminal";
import { useRadar } from "@/store/radar";
import { Dot } from "./ui";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function Header() {
  const ping = useRpcPing();
  const guard = useWalletGuard();
  const { publicKey } = useWallet();
  const setDrawer = useTerminal((s) => s.setDrawer);
  const scan = useScan(publicKey?.toBase58() ?? null);
  const pending = scan.data?.totals.actionsPending ?? 0;
  const radar = useRadar();
  const [bellOpen, setBellOpen] = useState(false);

  const ticker = useQuery<{ cookUsd: number | null }>({
    queryKey: ["ticker"],
    refetchInterval: 10_000,
    staleTime: 5_000,
    queryFn: async () => {
      const res = await fetch("/api/ticker");
      if (!res.ok) throw new Error(`ticker ${res.status}`);
      return res.json();
    },
  });

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ borderColor: "var(--line)", background: "rgba(13,10,7,0.88)", backdropFilter: "blur(8px)" }}
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-4">
        <a href="/" className="flex items-center gap-2.5" aria-label="MomoPulse home">
          <Image src="/logo.png" alt="" width={28} height={28} style={{ boxShadow: "var(--glow)" }} priority />
          <span className="hidden leading-none sm:block">
            <span className="block text-[15px] font-bold tracking-[0.18em]" style={{ color: "var(--text)" }}>
              MOMO<span style={{ color: "var(--honey)" }}>PULSE</span>
            </span>
            <span className="num block text-[9px] tracking-[0.14em]" style={{ color: "var(--dim)" }}>
              LAUNCHPAD TERMINAL · COOKIE CHAIN
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="chip num hidden md:inline-flex" title="COOK/USD (CookieScan)">
            COOK{" "}
            <b style={{ color: "var(--honey2)" }}>
              {ticker.data?.cookUsd != null ? `$${ticker.data.cookUsd.toFixed(6)}` : "···"}
            </b>
          </span>
          <span className="chip num hidden sm:inline-flex" title="getSlot round-trip · rpc.cookiescan.io">
            RPC <b style={{ color: ping.alive ? "var(--jade)" : "var(--coral)" }}>{ping.ms != null ? `${ping.ms}ms` : "···"}</b>
          </span>
          <span
            className="chip"
            title={
              guard.status === "ok"
                ? `genesis ${guard.genesisHash}`
                : (guard.detail ?? "verifying genesis hash")
            }
          >
            <Dot tone={guard.status === "ok" ? "ok" : guard.status === "checking" ? "idle" : "bad"} />
            <span className="hidden sm:inline">
              {guard.status === "ok" ? "cookie chain" : guard.status === "wrong-network" ? "wrong net" : guard.status === "unreachable" ? "rpc down" : "verifying"}
            </span>
          </span>

          <div className="relative">
            <button
              className="btn btn-ghost btn-icon relative"
              onClick={() => {
                setBellOpen((o) => !o);
                radar.markRead();
              }}
              aria-label="graduation radar"
              title="graduation radar — phase transitions"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 2a4 4 0 0 0-4 4v3l-1.5 2.5h11L12 9V6a4 4 0 0 0-4-4ZM6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              {radar.unread > 0 && (
                <span
                  className="num absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center px-1 text-[9px] font-bold"
                  style={{ background: "#a78bfa", color: "#140b2e", boxShadow: "0 0 10px rgba(167,139,250,.6)" }}
                >
                  {radar.unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="panel absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] p-2" style={{ boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
                <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--dim)" }}>
                  graduation radar
                </p>
                {radar.events.length === 0 && (
                  <p className="p-2 text-[11px]" style={{ color: "var(--dim)" }}>
                    no phase transitions yet — watching every pool on a 5s cadence.
                  </p>
                )}
                {radar.events.map((e) => (
                  <div key={`${e.pool}${e.ts}`} className="border-t px-1 py-1.5 first:border-t-0" style={{ borderColor: "var(--line)" }}>
                    <p className="text-[11.5px]">
                      <b style={{ color: "#a78bfa" }}>{e.symbol}</b>{" "}
                      <span style={{ color: "var(--muted)" }}>
                        {e.from} → {e.to}
                      </span>
                    </p>
                    <p className="num text-[9.5px]" style={{ color: "var(--dim)" }}>
                      {new Date(e.ts).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-ghost relative"
            onClick={() => setDrawer(true)}
            title="true positions · claims · creator fees"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">positions</span>
            {pending > 0 && (
              <span
                className="num absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center px-1 text-[9px] font-bold"
                style={{ background: "var(--honey)", color: "#1a1206", boxShadow: "var(--glow)" }}
              >
                {pending}
              </span>
            )}
          </button>

          <WalletMultiButton />
        </div>
      </div>

      {guard.status === "wrong-network" && (
        <div
          className="border-t px-4 py-1.5 text-center text-[11px]"
          style={{ borderColor: "var(--line)", background: "var(--coral-dim)", color: "var(--coral)" }}
        >
          {guard.detail}
        </div>
      )}
    </header>
  );
}
