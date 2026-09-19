"use client";

/**
 * Execution panel (H19–21, UI only — tx wiring is Phase 3). The quote box is the SAME BigInt
 * path as the program (buildBuyQuote/buildSellQuote → estimateBuy/estimateSell): it updates on
 * every keystroke with zero network calls. Tolerance slider + impact guard visual included.
 */
import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { buildBuyQuote, buildSellQuote, IMPACT_DANGER_PCT, IMPACT_WARN_PCT } from "@/lib/quote";
import { runTxFlow, type FlowResult } from "@/lib/txflow";
import { useTx, COOKIE_REFERRER } from "@/hooks/useTx";
import { rawToUi, uiToRaw } from "@/core/format";
import { C } from "@/core/constants";
import type { LaunchpadConfig, LaunchpadPool } from "@/core/types";
import type { PositionView } from "@/core/positions";

const BUY_PRESETS = ["0.5", "1", "5", "25"];

function Row({ label, value, tone, title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px]" title={title}>
      <span className="text-[10.5px] uppercase tracking-[0.1em]" style={{ color: "var(--dim)" }}>
        {label}
      </span>
      <span className="num text-[12px] font-semibold" style={{ color: tone ?? "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

function ImpactGuard({ pct, level }: { pct: number | null; level: "safe" | "warn" | "danger" }) {
  const pos = pct == null ? 0 : Math.min(pct / 20, 1) * 100;
  const color = level === "safe" ? "var(--jade)" : level === "warn" ? "var(--honey)" : "var(--coral)";
  return (
    <div className="pt-1">
      <div className="flex justify-between text-[9.5px] uppercase tracking-[0.1em]" style={{ color: "var(--dim)" }}>
        <span>price impact</span>
        <span className="num font-bold" style={{ color }}>
          {pct == null ? "—" : `${pct.toFixed(2)}% · ${level}`}
        </span>
      </div>
      <div className="relative mt-1 h-[6px]" style={{ background: "var(--panel3)" }}>
        {/* zone boundaries: warn at 3%, danger at 10% (of the 20% axis) */}
        <div className="absolute inset-y-0" style={{ left: `${(IMPACT_WARN_PCT / 20) * 100}%`, width: `${((IMPACT_DANGER_PCT - IMPACT_WARN_PCT) / 20) * 100}%`, background: "rgba(245,165,36,0.22)" }} />
        <div className="absolute inset-y-0" style={{ left: `${(IMPACT_DANGER_PCT / 20) * 100}%`, right: 0, background: "rgba(255,107,122,0.25)" }} />
        <div
          className="absolute top-[-3px] h-[12px] w-[3px]"
          style={{ left: `calc(${pos}% - 1px)`, background: color, boxShadow: `0 0 8px ${color}`, transition: "left 120ms var(--ease-out)" }}
        />
      </div>
    </div>
  );
}

export function ExecutionPanel({
  pool,
  cfg,
  position,
  tokenDecimals = 6,
}: {
  pool: LaunchpadPool;
  cfg: LaunchpadConfig | null;
  position?: PositionView | null;
  tokenDecimals?: number;
}) {
  const { connected } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [buyAmt, setBuyAmt] = useState("1");
  const [sellAmt, setSellAmt] = useState("");
  const [tol, setTol] = useState(1);

  const buy = useMemo(() => buildBuyQuote(pool, cfg, buyAmt, tol, tokenDecimals), [pool, cfg, buyAmt, tol, tokenDecimals]);
  const sell = useMemo(
    () => buildSellQuote(pool, cfg, sellAmt, tol, tokenDecimals, position ? BigInt(position.sharesRaw) : undefined),
    [pool, cfg, sellAmt, tol, tokenDecimals, position],
  );

  const { signer, connection, reconcile } = useTx();
  const [busy, setBusy] = useState(false);

  const onTrade = async () => {
    if (!signer || busy) return;
    setBusy(true);
    try {
      const amountRaw =
        side === "buy" ? uiToRaw(buyAmt, C.COOK_DECIMALS).toString() : uiToRaw(sellAmt, tokenDecimals).toString();
      await runTxFlow(
        connection,
        {
          kind: side,
          pool: pool.pubkey,
          wallet: signer.publicKey,
          phase: pool.status,
          amountRaw,
          referrer: side === "buy" ? COOKIE_REFERRER : undefined,
          expectedOutRaw: side === "buy" ? (buy.tokensOutRaw ?? undefined) : (sell.netCookRaw ?? undefined),
          requote: async () => {
            const r = await fetch("/api/pools?status=all");
            if (!r.ok) return null;
            const j = (await r.json()) as { pools: LaunchpadPool[] };
            const fresh = j.pools.find((p) => p.pubkey === pool.pubkey);
            if (!fresh) return null;
            return side === "buy"
              ? buildBuyQuote(fresh, cfg, buyAmt, tol, tokenDecimals).tokensOutRaw
              : buildSellQuote(fresh, cfg, sellAmt, tol, tokenDecimals, position ? BigInt(position.sharesRaw) : undefined).netCookRaw;
          },
          onReconcile: reconcile,
        },
        signer,
      );
    } finally {
      setBusy(false);
    }
  };

  const sharesUi = position?.sharesUi ?? "0";
  const sellPreset = (pct: number) => {
    if (!position) return;
    const raw = (BigInt(position.sharesRaw) * BigInt(pct)) / 100n;
    setSellAmt(rawToUi(raw, tokenDecimals));
  };

  const isLive = pool.status === "live";

  return (
    <section className="panel flex flex-col" aria-label="trade execution">
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>
          execute · {pool.symbol}
        </h2>
        <span className="chip num" title="quote computed locally, program-exact">
          local math · 0ms
        </span>
      </div>

      <div className="p-3">
        <div className="tabs grid grid-cols-2" role="tablist" aria-label="trade side">
          <span className="thumb" style={{ width: "calc(50% - 4px)", transform: side === "buy" ? "translateX(0)" : "translateX(calc(100% + 2px))" }} />
          <button role="tab" aria-selected={side === "buy"} onClick={() => setSide("buy")}>
            buy
          </button>
          <button role="tab" aria-selected={side === "sell"} onClick={() => setSide("sell")}>
            sell
          </button>
        </div>

        {side === "buy" ? (
          <>
            <label className="mt-3 block text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--dim)" }}>
              you pay (COOK)
            </label>
            <input className="input mt-1 num text-[15px]" inputMode="decimal" value={buyAmt} onChange={(e) => setBuyAmt(e.target.value)} placeholder="0.00" />
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {BUY_PRESETS.map((p) => (
                <button key={p} className="btn btn-ghost !px-1 !py-1.5 num text-[11px]" onClick={() => setBuyAmt(p)}>
                  {p}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="mt-3 block text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--dim)" }}>
              you sell ({pool.symbol} shares){position ? ` · you hold ${sharesUi}` : ""}
            </label>
            <input className="input mt-1 num text-[15px]" inputMode="decimal" value={sellAmt} onChange={(e) => setSellAmt(e.target.value)} placeholder="0.00" />
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} className="btn btn-ghost !px-1 !py-1.5 num text-[11px]" disabled={!position} onClick={() => sellPreset(p)} title={position ? `${p}% of your shares` : "no position in this pool"}>
                  {p}%
                </button>
              ))}
            </div>
          </>
        )}

        {/* tolerance */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--dim)" }}>
            tolerance
          </span>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            value={tol}
            onChange={(e) => setTol(Number(e.target.value))}
            className="flex-1"
            style={{ ["--fill" as string]: `${((tol - 0.1) / 9.9) * 100}%` }}
            aria-label="slippage tolerance percent"
          />
          <span className="num w-12 text-right text-[12px] font-bold" style={{ color: "var(--honey2)" }}>
            {tol.toFixed(1)}%
          </span>
        </div>

        {/* quote box */}
        <div className="mt-3 border p-2.5" style={{ borderColor: "var(--line)", background: "var(--bg2)" }}>
          {side === "buy" ? (
            buy.ok ? (
              <>
                <Row label="you receive ≈" value={`${buy.tokensOutUi} ${pool.symbol}`} tone="var(--honey2)" />
                <Row label="min received" value={`${buy.minTokensOutUi} ${pool.symbol}`} title="tx reverts below this (slippage guard)" />
                <Row label="trade fee" value={`${buy.feeCookUi} COOK`} title={`${buy.feeBps} bps, off the top`} />
                <Row label="avg price" value={buy.avgPriceCook ? `${buy.avgPriceCook.toPrecision(5)} COOK` : "—"} />
                <Row label="spot now" value={`${buy.spotCook.toPrecision(5)} COOK`} />
                <ImpactGuard pct={buy.impactPct} level={buy.impactLevel} />
              </>
            ) : (
              <p className="py-2 text-center text-[11.5px]" style={{ color: "var(--dim)" }}>
                {buy.error}
              </p>
            )
          ) : sell.ok ? (
            <>
              <Row label="you receive ≈" value={`${sell.netCookUi} COOK`} tone="var(--honey2)" />
              <Row label="min received" value={`${sell.minCookOutUi} COOK`} />
              <Row label="gross / fee" value={`${sell.grossCookUi} / ${sell.feeCookUi}`} />
              <Row label="avg price" value={sell.avgPriceCook ? `${sell.avgPriceCook.toPrecision(5)} COOK` : "—"} />
              <ImpactGuard pct={sell.impactPct} level={sell.impactLevel} />
            </>
          ) : (
            <p className="py-2 text-center text-[11.5px]" style={{ color: "var(--dim)" }}>
              {sell.error}
            </p>
          )}
        </div>

        <button
          className="btn btn-honey mt-3 w-full !py-3"
          disabled={!connected || !isLive || busy}
          title={connected ? (isLive ? "sign with your wallet" : "pool not live") : "connect a wallet first"}
          onClick={onTrade}
        >
          {busy ? "flow running…" : connected ? `${side} ${pool.symbol}` : "connect wallet to trade"}
        </button>
        <p className="mt-1.5 text-center text-[10px]" style={{ color: "var(--dim)" }}>
          {isLive
            ? COOKIE_REFERRER
              ? "quotes are program-exact · referral fee (20% of 1%) funds MomoPulse — disclosed"
              : "quotes are program-exact (BigInt curve math) · guard: sanitize → blockhash → re-quote"
            : `pool is ${pool.status} — trading closed; claims live in the drawer`}
        </p>
      </div>
    </section>
  );
}
