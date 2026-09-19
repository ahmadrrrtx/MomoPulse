"use client";

/**
 * Price series (H13–16, perf-pass H36–38): lightweight-charts is DYNAMIC-imported inside the
 * chart effect so the ~45 kB library never touches the critical path — the curve canvas and
 * feed paint first, the fills chart hydrates a beat later with a skeleton in between.
 * Seeded with REAL fill history (/api/trades), extended live from polled curve state
 * (ring buffer 720) — log scale, because bonding curves span decades.
 */
import { useEffect, useMemo, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useTrades } from "@/hooks/useFeed";
import { spotPriceCook } from "@/core/curve";
import { C } from "@/core/constants";
import type { LaunchpadPool } from "@/core/types";
import { Skeleton } from "./ui";

const RING_CAP = 720;

export function PriceChart({ pool, tokenDecimals = 6 }: { pool: LaunchpadPool; tokenDecimals?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const ringRef = useRef<{ time: number; value: number }[]>([]);
  const trades = useTrades(pool.pubkey);

  const history = useMemo(() => {
    const pts = (trades.data?.trades ?? []).filter((t) => t.ts > 0 && t.price > 0);
    const bySec = new Map<number, number>();
    for (const t of pts) bySec.set(t.ts, t.price);
    return [...bySec.entries()].map(([time, value]) => ({ time, value })).sort((a, b) => a.time - b.time);
  }, [trades.data]);

  // chart lifecycle — library loaded off the critical path
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (cancelled || !wrapRef.current) return;
      const chart = lc.createChart(wrapRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: "#6f5f4b",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(244,234,219,0.05)" },
          horzLines: { color: "rgba(244,234,219,0.05)" },
        },
        rightPriceScale: { borderColor: "rgba(244,234,219,0.1)", mode: lc.PriceScaleMode.Logarithmic },
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
      if (history.length > 0) {
        series.setData(history.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        ringRef.current = history.slice(-RING_CAP);
        chart.timeScale().fitContent();
      }
    })();
    return () => {
      cancelled = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ringRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // seed history when it arrives (chart already alive)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || history.length === 0) return;
    series.setData(history.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
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
