"use client";

/**
 * The bonding curve, drawn honestly (H13–16): marginal price p(t) = k₀ / (vtr − t)² over
 * tokens sold t ∈ [0, sale], filled under the SOLD region, graduation marker, pulsing current
 * price, and entry pins for the connected wallet's positions (avg cost line + pin).
 * DPR-aware canvas, redraw only on state change / pointer move, rAF-gated (skips hidden tabs
 * and honors prefers-reduced-motion by dropping the pulse).
 */
import { useEffect, useRef } from "react";
import type { LaunchpadPool } from "@/core/types";
import type { PositionView } from "@/core/positions";
import { C } from "@/core/constants";

interface Props {
  pool: LaunchpadPool;
  tokenDecimals?: number;
  positions?: PositionView[]; // connected wallet's positions on THIS pool
}

interface Hover {
  t: number;
  price: number;
  x: number;
  y: number;
}

export function CurveCanvas({ pool, tokenDecimals = 6, positions = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ pool: LaunchpadPool; positions: PositionView[]; hover: Hover | null }>({
    pool,
    positions,
    hover: null,
  });
  const dirtyRef = useRef(true);

  stateRef.current.pool = pool;
  stateRef.current.positions = positions;

  // geometry (floats, UI units): k0 = vpr·vtr invariant; price(t) = k0/(vtr−t)²
  const geom = (p: LaunchpadPool, tokDec: number) => {
    const vpr = Number(p.virtualPaymentReserve) / 10 ** C.COOK_DECIMALS;
    const vtr = Number(p.virtualTokenReserve) / 10 ** tokDec;
    const sold = Number(p.tokensSold) / 10 ** tokDec;
    const k0 = vpr * vtr;
    const gradCook = Number(p.graduationTarget || C.GRADUATION_TARGET_FALLBACK) / 10 ** C.COOK_DECIMALS;
    const tGrad = Math.max(0, vtr - k0 / (vpr + gradCook));
    const sale = Number(p.saleTokenSupply) / 10 ** tokDec || tGrad;
    const tMax = Math.min(sale, vtr * 0.999);
    const priceAt = (t: number) => k0 / Math.pow(vtr - t, 2);
    return { vpr, vtr, sold, k0, tGrad, tMax, priceAt };
  };

  useEffect(() => {
    dirtyRef.current = true;
  }, [pool, positions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = wrap.getBoundingClientRect();
      w = Math.max(280, rect.width);
      h = Math.max(200, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirtyRef.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const PAD = { l: 58, r: 14, t: 14, b: 26 };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      // pulse animates → redraw ~30fps while visible; static under reduced motion
      if (!dirtyRef.current && reduced) return;
      if (!dirtyRef.current && reduced === false && time - lastDraw < 66) return;
      lastDraw = time;
      dirtyRef.current = false;

      const { pool: p, positions: pos, hover } = stateRef.current;
      const g = geom(p, tokenDecimals);
      const yMax = g.priceAt(Math.min(g.tMax, Math.max(g.tGrad * 1.08, g.sold * 1.05))) * 1.06;
      const yMin = g.priceAt(0) * 0.94;
      const xOf = (t: number) => PAD.l + (t / g.tMax) * (w - PAD.l - PAD.r);
      const yOf = (pr: number) => h - PAD.b - ((pr - yMin) / (yMax - yMin)) * (h - PAD.t - PAD.b);

      ctx.clearRect(0, 0, w, h);

      // grid + axis labels
      ctx.strokeStyle = "rgba(244,234,219,0.06)";
      ctx.fillStyle = "#6f5f4b";
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const pr = yMin + ((yMax - yMin) * i) / 4;
        const y = yOf(pr);
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(w - PAD.r, y);
        ctx.stroke();
        ctx.fillText(pr.toPrecision(4), 6, y + 3);
      }
      for (let i = 0; i <= 4; i++) {
        const t = (g.tMax * i) / 4;
        const x = xOf(t);
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, h - PAD.b);
        ctx.stroke();
        const label = t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1e3 ? `${(t / 1e3).toFixed(0)}K` : t.toFixed(0);
        ctx.fillText(label, x - 10, h - 8);
      }

      // sold-region fill (money already in the curve)
      const soldT = Math.min(g.sold, g.tMax);
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(g.priceAt(0)));
      const N = 160;
      for (let i = 1; i <= N; i++) {
        const t = (soldT * i) / N;
        ctx.lineTo(xOf(t), yOf(g.priceAt(t)));
      }
      ctx.lineTo(xOf(soldT), h - PAD.b);
      ctx.lineTo(xOf(0), h - PAD.b);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, PAD.t, 0, h - PAD.b);
      grad.addColorStop(0, "rgba(245,165,36,0.30)");
      grad.addColorStop(1, "rgba(245,165,36,0.02)");
      ctx.fillStyle = grad;
      ctx.fill();

      // full curve line
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = (g.tMax * i) / N;
        const x = xOf(t);
        const y = yOf(g.priceAt(t));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#f5a524";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(245,165,36,0.5)";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // graduation marker
      if (g.tGrad > 0 && g.tGrad < g.tMax) {
        const x = xOf(g.tGrad);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(111,227,165,0.75)";
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, h - PAD.b);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#6fe3a5";
        ctx.fillText("GRADUATION", x + 4, PAD.t + 10);
      }

      // sold boundary + pulsing current price
      const cx = xOf(soldT);
      const cy = yOf(g.priceAt(soldT));
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "rgba(244,234,219,0.22)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, h - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      const pulse = reduced ? 0.6 : (Math.sin(time / 420) + 1) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + pulse * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,200,102,${0.35 + pulse * 0.3})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffc866";
      ctx.fill();

      // entry pins for the connected wallet
      for (const v of pos) {
        if (v.sharesRaw === "0" || BigInt(v.investedRaw ?? "0") === 0n) continue;
        const avg =
          Number(BigInt(v.investedRaw) - BigInt(v.withdrawnRaw)) /
          10 ** C.COOK_DECIMALS /
          (Number(BigInt(v.sharesRaw)) / 10 ** tokenDecimals);
        if (!(avg > 0) || avg < yMin || avg > yMax) continue;
        const y = yOf(avg);
        const up = g.priceAt(soldT) >= avg;
        const col = up ? "#6fe3a5" : "#ff6b7a";
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(w - PAD.r, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        // pin at the current sold depth
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + 7, y - 7);
        ctx.lineTo(cx + 14, y - 7);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.fillText(`your entry ${avg.toPrecision(4)}`, cx + 16, y - 4);
      }

      // hover crosshair
      if (hover) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = "rgba(244,234,219,0.35)";
        ctx.beginPath();
        ctx.moveTo(hover.x, PAD.t);
        ctx.lineTo(hover.x, h - PAD.b);
        ctx.moveTo(PAD.l, hover.y);
        ctx.lineTo(w - PAD.r, hover.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const label = `${hover.price.toPrecision(4)} COOK @ ${(hover.t / 1e3).toFixed(0)}K sold`;
        ctx.font = "10.5px 'IBM Plex Mono', monospace";
        const tw = ctx.measureText(label).width + 12;
        const bx = Math.min(Math.max(hover.x + 10, PAD.l), w - tw - 6);
        const by = Math.max(hover.y - 26, PAD.t);
        ctx.fillStyle = "rgba(29,22,16,0.95)";
        ctx.strokeStyle = "#3d3021";
        ctx.fillRect(bx, by, tw, 18);
        ctx.strokeRect(bx, by, tw, 18);
        ctx.fillStyle = "#ffc866";
        ctx.fillText(label, bx + 6, by + 12.5);
      }
    };
    let lastDraw = 0;
    raf = requestAnimationFrame(draw);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < PAD.l || x > w - PAD.r || y < PAD.t || y > h - PAD.b) {
        stateRef.current.hover = null;
      } else {
        const g = geom(stateRef.current.pool, tokenDecimals);
        const t = ((x - PAD.l) / (w - PAD.l - PAD.r)) * g.tMax;
        stateRef.current.hover = { t, price: g.priceAt(t), x, y };
      }
      dirtyRef.current = true;
    };
    const onLeave = () => {
      stateRef.current.hover = null;
      dirtyRef.current = true;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenDecimals]);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="block" aria-label="bonding curve marginal price chart" />
    </div>
  );
}
