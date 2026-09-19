"use client";

/** Stat strip above the chart: the numbers a trader checks before touching the curve. */
import { spotPriceCook, graduationProgressPct } from "@/core/curve";
import { poolPhase } from "@/core/phases";
import { poolTradeFeeBps } from "@/core/fees";
import { bpsToPct } from "@/core/format";
import { C } from "@/core/constants";
import { countdownLabel, useNow } from "./ui";
import type { LaunchpadConfig, LaunchpadPool } from "@/core/types";

function Cell({ label, value, tone, title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div className="min-w-0 border-r px-3 py-1.5 last:border-r-0" style={{ borderColor: "var(--line)" }} title={title}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--dim)" }}>
        {label}
      </div>
      <div className="num truncate text-[12.5px] font-semibold" style={{ color: tone ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

export function StatsStrip({
  pool,
  cfg,
  tokenDecimals = 6,
}: {
  pool: LaunchpadPool;
  cfg: LaunchpadConfig | null;
  tokenDecimals?: number;
}) {
  const now = useNow(1_000);
  const nowSec = Math.floor(now / 1000);
  const phase = poolPhase(pool, nowSec);
  const spot = spotPriceCook(pool, C.COOK_DECIMALS, tokenDecimals);
  const pct = graduationProgressPct(pool.paymentRaisedNet, pool.graduationTarget || C.GRADUATION_TARGET_FALLBACK);
  const raised = Number(pool.paymentRaisedNet) / 1e9;
  const target = Number(pool.graduationTarget || C.GRADUATION_TARGET_FALLBACK) / 1e9;
  const left = countdownLabel(pool.endTs, now);
  const feeBps = poolTradeFeeBps(pool, cfg);
  const supply = Number(pool.totalTokenSupply) / 10 ** tokenDecimals;
  const mcap = spot * supply;

  return (
    <div className="panel grid grid-cols-3 divide-y-0 overflow-hidden sm:grid-cols-4 lg:grid-cols-8" role="group" aria-label="pool statistics">
      <Cell label="spot" value={`${spot.toPrecision(5)} COOK`} tone="var(--honey2)" title="marginal curve price, COOK per token" />
      <Cell label="mcap" value={mcap >= 1e6 ? `${(mcap / 1e6).toFixed(2)}M` : mcap >= 1e3 ? `${(mcap / 1e3).toFixed(1)}K` : mcap.toFixed(0)} title="spot × total supply, in COOK" />
      <Cell label="raised" value={`${raised.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${target.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} title="net payment raised vs graduation target" />
      <Cell label="→ grad" value={`${pct.toFixed(2)}%`} tone={pct >= 100 ? "var(--jade)" : undefined} />
      <Cell label="holders" value={`${pool.participantCount ?? 0}`} />
      <Cell label="fee" value={bpsToPct(feeBps)} title="trade fee (pool snapshot > config > default)" />
      <Cell
        label="phase"
        value={phase === "live" && left ? left : phase}
        tone={phase === "live" ? "var(--jade)" : phase === "graduated" ? "var(--sky)" : phase === "expired" ? "var(--coral)" : "var(--honey2)"}
        title={phase === "live" ? `ends in ${left ?? "—"}` : pool.expiryMode}
      />
      <Cell
        label="mode"
        value={`${pool.expiryMode}${pool.antiSnipe ? " · ⚡" : ""}`}
        title={`expiry mode: ${pool.expiryMode}${pool.antiSnipe ? " · anti-snipe enabled" : ""}`}
      />
    </div>
  );
}
