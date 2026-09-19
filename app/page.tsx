"use client";

/**
 * MomoPulse terminal (Phase 2): feed left · curve+price+safety center · execution+on-ramp right,
 * positions drawer overlay, and a 4-tab bottom bar under 1024px (usable at 375px).
 */
import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Header } from "@/components/Header";
import { PoolFeed } from "@/components/PoolFeed";
import { CurveCanvas } from "@/components/CurveCanvas";
import { PriceChart } from "@/components/PriceChart";
import { StatsStrip } from "@/components/StatsStrip";
import { SafetyRow } from "@/components/SafetyRow";
import { ExecutionPanel } from "@/components/ExecutionPanel";
import { OnRampPanel } from "@/components/OnRampPanel";
import { PositionsDrawer } from "@/components/PositionsDrawer";
import { Toaster } from "@/components/Toaster";
import { Skeleton } from "@/components/ui";
import { useLaunchpadConfig, usePoolFeed, useScan } from "@/hooks/useFeed";
import { useRadarWatcher } from "@/hooks/useRadar";
import { useTerminal, type MobileTab } from "@/store/terminal";

const TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: "feed", label: "feed", icon: "M2 3h12M2 8h12M2 13h8" },
  { id: "chart", label: "chart", icon: "M2 13l4-5 3 3 5-7" },
  { id: "trade", label: "trade", icon: "M3 4h10v10H3zM7 1v3M1 7h3" },
  { id: "ramp", label: "on-ramp", icon: "M8 1v14M4 5l4-4 4 4" },
];

function CenterColumn() {
  const { pools } = usePoolFeed().data ?? { pools: [] };
  const selectedPool = useTerminal((s) => s.selectedPool);
  const cfg = useLaunchpadConfig();
  const { publicKey } = useWallet();
  const scan = useScan(publicKey?.toBase58() ?? null);

  const pool = useMemo(() => {
    if (pools.length === 0) return null;
    return pools.find((p) => p.pubkey === selectedPool) ?? pools.find((p) => p.status === "live") ?? pools[0];
  }, [pools, selectedPool]);

  if (!pool) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Skeleton h={44} />
        <Skeleton className="flex-1" />
        <Skeleton h={180} />
      </div>
    );
  }

  const myPosition = scan.data?.positions.find((v) => v.pool === pool.pubkey) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="panel flex items-center gap-2 px-3 py-1.5">
        <b className="text-[13px] tracking-wide" style={{ color: "var(--text)" }}>
          {pool.symbol}
        </b>
        <span className="num truncate text-[10.5px]" style={{ color: "var(--dim)" }}>
          {pool.name}
        </span>
        <span className="num ml-auto hidden text-[10px] sm:inline" style={{ color: "var(--dim)" }} title="pool address">
          {pool.pubkey.slice(0, 8)}…{pool.pubkey.slice(-6)}
        </span>
      </div>
      <StatsStrip pool={pool} cfg={cfg.data ?? null} />
      <div className="panel min-h-[240px] flex-1 p-1.5">
        <div className="flex items-center justify-between px-1.5 pb-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--dim)" }}>
            bonding curve · marginal price
          </span>
          <span className="num text-[9.5px]" style={{ color: "var(--dim)" }}>
            COOK/token vs tokens sold
          </span>
        </div>
        <div className="h-[calc(100%-20px)]">
          <CurveCanvas pool={pool} positions={myPosition ? [myPosition] : []} />
        </div>
      </div>
      <div className="panel h-[190px] p-1.5 sm:h-[210px]">
        <div className="flex items-center justify-between px-1.5 pb-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--dim)" }}>
            fills · log scale
          </span>
          <span className="num text-[9.5px]" style={{ color: "var(--dim)" }}>
            real trade history + live curve ticks
          </span>
        </div>
        <div className="h-[calc(100%-20px)]">
          <PriceChart pool={pool} />
        </div>
      </div>
      <SafetyRow mint={pool.tokenMint} symbol={pool.symbol} />
    </div>
  );
}

function RightColumn() {
  const { pools } = usePoolFeed().data ?? { pools: [] };
  const selectedPool = useTerminal((s) => s.selectedPool);
  const cfg = useLaunchpadConfig();
  const { publicKey } = useWallet();
  const scan = useScan(publicKey?.toBase58() ?? null);

  const pool = useMemo(() => {
    if (pools.length === 0) return null;
    return pools.find((p) => p.pubkey === selectedPool) ?? pools.find((p) => p.status === "live") ?? pools[0];
  }, [pools, selectedPool]);

  if (!pool) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton h={380} />
        <Skeleton h={260} />
      </div>
    );
  }
  const myPosition = scan.data?.positions.find((v) => v.pool === pool.pubkey) ?? null;

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      <ExecutionPanel pool={pool} cfg={cfg.data ?? null} position={myPosition} />
      <OnRampPanel />
    </div>
  );
}

export default function Home() {
  const { mobileTab, setMobileTab } = useTerminal();
  const feed = usePoolFeed();
  useRadarWatcher(feed.data?.pools);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {/* desktop / tablet grid */}
      <main className="mx-auto hidden w-full max-w-[1600px] flex-1 gap-2 p-2 lg:grid lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:overflow-hidden" style={{ height: "calc(100vh - 49px)" }}>
        <PoolFeed />
        <CenterColumn />
        <RightColumn />
      </main>

      {/* mobile: one panel at a time, bottom tab bar */}
      <main className="flex-1 p-2 pb-16 lg:hidden" style={{ minHeight: "calc(100vh - 49px)" }}>
        <div className={mobileTab === "feed" ? "h-[calc(100vh-120px)]" : "hidden"}>
          <PoolFeed />
        </div>
        <div className={mobileTab === "chart" ? "flex h-auto flex-col" : "hidden"}>
          <CenterColumn />
        </div>
        <div className={mobileTab === "trade" ? "" : "hidden"}>
          <RightColumnTradeOnly />
        </div>
        <div className={mobileTab === "ramp" ? "" : "hidden"}>
          <OnRampPanel />
        </div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 border-t lg:hidden"
        style={{ borderColor: "var(--line2)", background: "rgba(13,10,7,0.96)", backdropFilter: "blur(8px)" }}
        aria-label="terminal sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMobileTab(t.id)}
            className="flex flex-col items-center gap-0.5 py-2"
            style={{ color: mobileTab === t.id ? "var(--honey)" : "var(--dim)", transition: "color 160ms var(--ease-out)" }}
            aria-current={mobileTab === t.id}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d={t.icon} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]">{t.label}</span>
          </button>
        ))}
      </nav>

      <PositionsDrawer />
      <Toaster />
    </div>
  );
}

/** mobile "trade" tab shows just the execution panel (on-ramp has its own tab) */
function RightColumnTradeOnly() {
  const { pools } = usePoolFeed().data ?? { pools: [] };
  const selectedPool = useTerminal((s) => s.selectedPool);
  const cfg = useLaunchpadConfig();
  const pool = pools.find((p) => p.pubkey === selectedPool) ?? pools.find((p) => p.status === "live") ?? pools[0] ?? null;
  if (!pool) return <Skeleton h={380} />;
  return <ExecutionPanel pool={pool} cfg={cfg.data ?? null} position={null} />;
}
