"use client";

/**
 * Terminal header (Artifact 4): logo · RPC ping chip · COOK ticker · network guard · wallet.
 */
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useRpcPing } from "@/hooks/useRpcPing";
import { useWalletGuard } from "@/hooks/useWalletGuard";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

interface Ticker {
  cookUsd: number | null;
  slot: number | null;
}

export function Header() {
  const ping = useRpcPing();
  const guard = useWalletGuard();
  const ticker = useQuery<Ticker>({
    queryKey: ["ticker"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const res = await fetch("/api/ticker");
      if (!res.ok) throw new Error(`ticker ${res.status}`);
      return res.json();
    },
  });

  const guardChip =
    guard.status === "ok" ? (
      <span className="mp-chip" title={`genesis ${guard.genesisHash}`}>
        <span className="mp-green">●</span> cookie chain
      </span>
    ) : guard.status === "wrong-network" ? (
      <span className="mp-chip mp-blink" title={guard.detail ?? undefined}>
        <span className="mp-red">●</span> wrong network
      </span>
    ) : guard.status === "unreachable" ? (
      <span className="mp-chip" title={guard.detail ?? undefined}>
        <span className="mp-red">●</span> rpc down
      </span>
    ) : (
      <span className="mp-chip">
        <span className="mp-amber mp-blink">●</span> verifying
      </span>
    );

  return (
    <header className="sticky top-0 z-40 border-b" style={{ borderColor: "var(--mp-line)", background: "rgba(9,13,22,0.92)", backdropFilter: "blur(6px)" }}>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <a href="/" className="flex items-center gap-2">
          <span className="text-base font-bold tracking-widest mp-neon mp-glow-text">MOMO</span>
          <span className="text-base font-bold tracking-widest">PULSE</span>
          <span className="mp-chip ml-1">v0.1 · phase 1</span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          <span className="mp-chip" title="COOK/USD from CookieScan">
            🍪 COOK{" "}
            <b className={ticker.data?.cookUsd != null ? "mp-neon" : "mp-dim"}>
              {ticker.data?.cookUsd != null ? `$${ticker.data.cookUsd.toFixed(4)}` : "…"}
            </b>
          </span>
          <span className="mp-chip" title="getSlot round-trip to rpc.cookiescan.io">
            RPC{" "}
            <b className={ping.alive ? "mp-green" : "mp-red"}>
              {ping.ms !== null ? `${ping.ms}ms` : "—"}
            </b>
          </span>
          {guardChip}
          <WalletMultiButton />
        </div>
      </div>
      {guard.status === "wrong-network" && (
        <div className="border-t px-4 py-1.5 text-center text-[11px] mp-amber" style={{ borderColor: "var(--mp-line)", background: "rgba(255,184,77,0.06)" }}>
          {guard.detail}
        </div>
      )}
    </header>
  );
}
