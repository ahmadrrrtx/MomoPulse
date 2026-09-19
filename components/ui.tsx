"use client";

/** Shared micro-primitives — every loading state in the terminal goes through these. */
import { useEffect, useState } from "react";

export function Skeleton({ className = "", w, h }: { className?: string; w?: number | string; h?: number | string }) {
  return <div className={`skel ${className}`} style={{ width: w, height: h }} />;
}

export function Spinner({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-label="loading"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "idle" }) {
  const color =
    tone === "ok" ? "var(--jade)" : tone === "warn" ? "var(--honey)" : tone === "bad" ? "var(--coral)" : "var(--dim)";
  return (
    <span
      className={tone === "idle" ? "" : "pulse-dot"}
      style={{ width: 6, height: 6, background: color, boxShadow: `0 0 8px ${color}`, display: "inline-block" }}
    />
  );
}

/** Token avatar: real IPFS image with graceful fallback to a monogram tile. */
export function TokenAvatar({
  uri,
  symbol,
  size = 34,
}: {
  uri?: string | null;
  symbol: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = uri?.startsWith("ipfs://") ? `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}` : uri || null;
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="num flex shrink-0 items-center justify-center font-semibold"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, var(--panel3), var(--panel2))",
          border: "1px solid var(--line2)",
          color: "var(--honey2)",
          fontSize: size * 0.42,
        }}
        aria-hidden
      >
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {!loaded && <Skeleton className="absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          border: "1px solid var(--line2)",
          opacity: loaded ? 1 : 0,
          transition: "opacity 200ms var(--ease-out)",
        }}
      />
    </div>
  );
}

/** Copy-to-clipboard with micro-feedback (scale + label swap, no toast spam). */
export function CopyButton({ value, label = "copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-icon ${done ? "copy-flash" : ""} ${className}`}
      title={`copy ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
        } catch {
          /* clipboard blocked — silent */
        }
      }}
    >
      {done ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-label="copied">
          <path d="M3 8.5 6.5 12 13 4.5" stroke="var(--jade)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-label={label}>
          <rect x="5.5" y="5.5" width="8" height="8" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.5 3.5v-1h-8v8h1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  );
}

/** Ticking wall clock for countdowns (1s cadence, paused with the tab). */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function countdownLabel(endTs: number, now: number): string | null {
  const s = Math.floor((endTs * 1000 - now) / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}
