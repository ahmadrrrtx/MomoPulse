/**
 * Pure amount/number formatting. Raw↔UI conversion uses BigInt so large amounts keep full
 * precision. Ported from cookiechain/cookie-mcp (MIT) src/core/format.ts @ v0.5.0.
 */

export function rawToUi(raw: string | bigint, decimals: number): string {
  const n = typeof raw === "bigint" ? raw : BigInt(raw);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const s = abs.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = decimals > 0 ? s.slice(s.length - decimals).replace(/0+$/, "") : "";
  const body = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${body}` : body;
}

/**
 * A `number` is normalized via toFixed(decimals) first: JS renders tiny numbers in scientific
 * notation (0.000000001 → "1e-9"), which the fixed-point parse below can't read. Pass a string
 * for exact large amounts.
 */
export function uiToRaw(ui: string | number, decimals: number): bigint {
  const s = typeof ui === "number" ? ui.toFixed(decimals) : ui.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") {
    throw new Error(`invalid amount: "${ui}"`);
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) {
    throw new Error(`amount has more than ${decimals} decimal places: "${ui}"`);
  }
  const fracPadded = frac.padEnd(decimals, "0");
  return BigInt((whole || "0") + fracPadded);
}

export function fmtUsd(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  if (abs >= 1) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (abs >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(4)}`;
}

export function shortAddr(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 5)}…${addr.slice(-5)}`;
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Compact number for feed cards: 1.2M, 845K, 0.36. */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return n.toFixed(2);
  if (abs === 0) return "0";
  return n.toPrecision(3);
}

/** Seconds → "2d 7h" / "4h 12m" / "38m 05s" countdown. */
export function fmtCountdown(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
