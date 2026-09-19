"use client";

/**
 * Price series (H13–16): lightweight-charts area chart seeded with REAL fill history from
 * /api/trades, then extended live from the polled curve state (ring buffer, cap 720 pts) and
 * DAS ticks when the mint has a DEX price. Log price scale — bonding curves span decades.
 */
import { useEffect, useMemo, useRef } from "react";
import { createChart, ColorType, PriceScaleMode, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useTrades } from "@/hooks/useFeed";
import { spotPriceCook } from "@/core/curve";
import { C } from "@/core/constants";
import type { LaunchpadPool } from "@/core/types";
import { Skeleton } from "./ui";

const RING_CAP = 720;

export function PriceChart({ pool, tokenDecimals = 6 }: { pool: LaunchpadPool; tokenDecimals?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addAreaSeries"]> | null>(null);
  const ringRef = useRef<{ time: number; value: number }[]>([]);
  const trades = useTrades(pool.pubkey);

  const history = useMemo(() => {
    const pts = (trades.data?.trades ?? [])
      .filter((t) => t.ts > 0 && t.price > 0)
      .map((t) => ({ time: t.ts, value: t.price }));
    // collapse duplicate seconds (keep last per second — chart requires unique times)
    const bySec = new Map<number, number>();
    for (const p of pts) bySec.set(p.time, p.value);
    return [...bySec.entries()].map(([time, value]) => ({ time, value })).sort((a, b) => a.time - b.time);
  }, [trades.data]);

  // chart lifecycle
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6f5f4b",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(244,234,219,0.05)" },
        horzLines: { color: "rgba(244,234,219,0.05)" },
      },
      rightPriceScale: { borderColor: "rgba(244,234,219,0.1)", mode: PriceScaleMode.Logarithmic },
      timeScale: { borderColor: "rgba(244,234,219,0.1)", timeVisible: true, secondsVisible: false },
      crosshair: {
        horzLine: { color: "rgba(245,165,36,0.5)", labelBackgroundColor: "#f5a524" },
        vertLine: { color: "rgba(245,165,36,0.5)", labelBackgroundColor: "#f5a524" },
      },
      autoSize: true,
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addAreaSeries({
      lineColor: "#f5a524",
      topColor: "rgba(245,165,36,0.32)",
      bottomColor: "rgba(245,165,36,0.02)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "rgba(255,200,102,0.7)",
      priceLineStyle: 2,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    ringRef.current = [];
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // seed history when it arrives
  useEffect(() => {
    if (!seriesRef.current || history.length === 0) return;
    seriesRef.current.setData(history.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    ringRef.current = history.slice(-RING_CAP);
    chartRef.current?.timeScale().fitContent();
  }, [history]);

  // live append from polled curve state (5s feed) — dedupe by second
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const spot = spotPriceCook(pool, C.COOK_DECIMALS, tokenDecimals);
    if (!(spot > 0)) return;
    const now = Math.floor(Date.now() / 1000);
    const ring = ringRef.current;
    const last = ring[ring.length - 1];
    if (last && last.time === now) {
      last.value = spot;
      series.update({ time: now as UTCTimestamp, value: spot });
    } else if (!last || now > last.time) {
      ring.push({ time: now, value: spot });
      if (ring.length > RING_CAP) ring.shift();
      series.update({ time: now as UTCTimestamp, value: spot });
    }
  }, [pool, tokenDecimals]);

  const empty = !trades.isLoading && history.length === 0;

  return (
    <div className="relative h-full w-full">
      <div ref={wrapRef} className="h-full w-full" />
      {trades.isLoading && (
        <div className="absolute inset-0 flex flex-col justify-end gap-2 p-3">
          <Skeleton h={8} w="70%" />
          <Skeleton h={8} w="55%" />
          <Skeleton h={8} w="62%" />
          <Skeleton h={8} w="40%" />
        </div>
      )}
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="num text-[11px]" style={{ color: "var(--dim)" }}>
            no fills yet — series builds live as the curve trades
          </p>
        </div>
      )}
    </div>
  );
}
