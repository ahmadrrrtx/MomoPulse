"use client";

/**
 * True Positions drawer (H16–19): the merged PositionView table no wallet can show —
 * curve shares, exact exit values, PnL, claims and creator fees/vest — with positionAction
 * CTAs rendered in their disabled Phase-3 state. Reconciles on 30s polls + window focus
 * (post-manual-trade refresh is the gate).
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useBalance, useScan } from "@/hooks/useFeed";
import { useTerminal } from "@/store/terminal";
import { useTx } from "@/hooks/useTx";
import { runSponsoredClaim, sweepClaims, type FlowParams } from "@/lib/txflow";
import { toast } from "@/store/toasts";
import { rawToUi } from "@/core/format";
import { C } from "@/core/constants";
import { CopyButton, Skeleton, Spinner } from "./ui";
import type { PositionView } from "@/core/positions";
import type { ClaimKind } from "@/clients/momoswap";

type Tab = "positions" | "claims" | "creator";

function claimKindOf(v: PositionView): ClaimKind | null {
  const k = v.action?.kind;
  if (k === "fair") return "fair";
  if (k === "graduated_tokens") return "graduated_tokens";
  if (k === "winner") return v.expiryMode === "jackpot" ? "jackpot" : "survivor";
  return null;
}

function ActionButton({ v, onAct, busy }: { v: PositionView; onAct: (v: PositionView) => void; busy: boolean }) {
  if (!v.action) return <span className="num text-[10px]" style={{ color: "var(--dim)" }}>hold</span>;
  const kind = v.action.kind;
  const label =
    kind === "sell" ? "sell ↗" : kind === "graduated_tokens" ? "claim tokens" : kind === "fair" ? "claim refund" : kind === "winner" ? "claim prize" : kind;
  const actionable = kind !== "sell";
  return (
    <button
      className="btn !px-2 !py-1 text-[10px]"
      disabled={!actionable || busy}
      title={kind === "sell" ? "sell from the execution panel (center-right)" : `${v.action.reason} — gasless via relayer when available`}
      onClick={() => onAct(v)}
    >
      {label}
    </button>
  );
}

function PositionRow({ v, onAct, busy }: { v: PositionView; onAct: (v: PositionView) => void; busy: boolean }) {
  const pnlNeg = (v.pnlRaw ?? "0").startsWith("-");
  return (
    <div className="border-b p-2.5" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center gap-2">
        <b className="text-[13px]" style={{ color: "var(--honey2)" }}>
          {v.symbol}
        </b>
        <span className={`badge badge-${v.status}`}>{v.status}</span>
        {v.expiryMode !== "dead" && <span className="badge badge-neutral">{v.expiryMode}</span>}
        <span className="ml-auto">
          <ActionButton v={v} onAct={onAct} busy={busy} />
        </span>
      </div>
      <div className="num mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <span style={{ color: "var(--dim)" }}>shares (curve)</span>
        <span className="text-right">{v.sharesUi}</span>
        <span style={{ color: "var(--dim)" }}>invested / out</span>
        <span className="text-right">
          {v.investedUi} / {v.withdrawnUi}
        </span>
        {v.exitValueUi !== null && (
          <>
            <span style={{ color: "var(--dim)" }}>exit value (exact)</span>
            <span className="text-right" style={{ color: "var(--jade)" }}>
              {v.exitValueUi} COOK
            </span>
            <span style={{ color: "var(--dim)" }}>pnl</span>
            <span className="text-right" style={{ color: pnlNeg ? "var(--coral)" : "var(--jade)" }}>
              {v.pnlUi} ({v.pnlPct?.toFixed(1)}%)
            </span>
          </>
        )}
        {v.creatorFeeUi && BigInt(v.creatorFeeRaw ?? "0") > 0n && (
          <>
            <span style={{ color: "var(--dim)" }}>creator fees</span>
            <span className="text-right" style={{ color: "var(--honey2)" }}>
              {v.creatorFeeUi} COOK
            </span>
          </>
        )}
        {v.vestRemainingUi && (
          <>
            <span style={{ color: "var(--dim)" }}>vest outstanding</span>
            <span className="text-right">{v.vestRemainingUi}</span>
          </>
        )}
      </div>
      {v.action && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--dim)" }}>
          {v.action.reason}
        </p>
      )}
    </div>
  );
}

export function PositionsDrawer() {
  const { drawerOpen, setDrawer } = useTerminal();
  const { publicKey, connected } = useWallet();
  const [tab, setTab] = useState<Tab>("positions");
  const [manual, setManual] = useState("");
  const wallet = publicKey?.toBase58() ?? (manual.trim().length > 30 ? manual.trim() : null);
  const scan = useScan(wallet);
  const balance = useBalance(wallet);
  const { signer, connection, reconcile } = useTx();
  const [busy, setBusy] = useState(false);

  /** One claim = sponsored flow (relayer pays gas); sells route to the execution panel. */
  const act = async (v: PositionView) => {
    if (!signer || busy) return;
    if (v.action?.kind === "sell") {
      toast.info("sell from the execution panel", "select the pool in the feed, then the sell tab", { ttl: 5_000 });
      return;
    }
    const ck = claimKindOf(v);
    if (!ck) return;
    if (ck === "jackpot" || ck === "survivor") {
      toast.warn("merkle proof required", "winner claims need the settlement proof — the launchpad UI publishes it", { ttl: 8_000 });
      return;
    }
    setBusy(true);
    try {
      await runSponsoredClaim(
        connection,
        {
          kind: "claim",
          claimKind: ck,
          pool: v.pool,
          wallet: signer.publicKey,
          amountRaw: ck === "fair" ? (BigInt(v.investedRaw) - BigInt(v.withdrawnRaw)).toString() : undefined,
          onReconcile: reconcile,
        },
        signer,
      );
    } finally {
      setBusy(false);
    }
  };

  const claimCreatorFees = async (pool: string) => {
    if (!signer || busy) return;
    setBusy(true);
    try {
      await runSponsoredClaim(connection, { kind: "claim_creator_fees", pool, wallet: signer.publicKey, onReconcile: reconcile }, signer);
    } finally {
      setBusy(false);
    }
  };

  const sweep = async () => {
    if (!signer || busy) return;
    const items: FlowParams[] = [
      ...claims.filter((v) => claimKindOf(v) === "fair" || claimKindOf(v) === "graduated_tokens").map((v) => ({
        kind: "claim" as const,
        claimKind: claimKindOf(v)!,
        pool: v.pool,
        wallet: signer.publicKey,
        amountRaw: claimKindOf(v) === "fair" ? (BigInt(v.investedRaw) - BigInt(v.withdrawnRaw)).toString() : undefined,
      })),
      ...created.filter((c) => BigInt(0n.toString()) >= 0n && c.unclaimedFeesCook !== "0").map((c) => ({
        kind: "claim_creator_fees" as const,
        pool: c.pool,
        wallet: signer.publicKey,
      })),
    ];
    if (items.length === 0) return;
    setBusy(true);
    try {
      await sweepClaims(connection, items, signer, scan.data?.programIds ?? {}, reconcile);
    } finally {
      setBusy(false);
    }
  };

  const drip = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      const res = await fetch("/api/drip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) });
      const j = await res.json();
      if (res.status === 409) toast.warn("already dripped", "this wallet is in the on-chain drip memo ledger", { ttl: 6_000 });
      else if (!res.ok) toast.bad("drip failed", j.error, { ttl: 8_000 });
      else {
        toast.ok("starter drip received — 0.05 COOK", j.sig, { action: { label: "explorer", onClick: () => window.open(j.explorer, "_blank") } });
        reconcile();
      }
    } finally {
      setBusy(false);
    }
  };

  // close on Escape (keyboard actions: no animation dependence, instant)
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, setDrawer]);

  const positions = scan.data?.positions ?? [];
  const claims = positions.filter((v) => v.action && v.action.kind !== "sell");
  const created = scan.data?.created ?? [];
  const totals = scan.data?.totals;

  return (
    <>
      <div className="drawer-overlay" data-open={drawerOpen} onClick={() => setDrawer(false)} aria-hidden />
      <aside className="drawer" data-open={drawerOpen} role="dialog" aria-label="true positions" aria-hidden={!drawerOpen}>
        {/* header */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--text)" }}>
            true positions
          </h2>
          <span className="chip" title="curve shares are invisible to wallets & explorers">
            wallet-blind money
          </span>
          <button className="btn btn-ghost btn-icon ml-auto" onClick={() => setDrawer(false)} aria-label="close drawer">
            ✕
          </button>
        </div>

        {/* wallet row */}
        <div className="border-b p-3" style={{ borderColor: "var(--line)" }}>
          {connected && publicKey ? (
            <div className="flex items-center gap-2">
              <span className="num text-[11.5px]" style={{ color: "var(--honey2)" }}>
                {publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-6)}
              </span>
              <CopyButton value={publicKey.toBase58()} className="!p-1" />
              <span className="num ml-auto text-[11px]" style={{ color: "var(--muted)" }} title="native + wrapped COOK">
                {balance.isLoading ? "…" : `${balance.data?.cook.toFixed(4)} COOK + ${balance.data?.wcook.toFixed(4)} wCOOK`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input className="input" placeholder="paste any wallet address to inspect…" value={manual} onChange={(e) => setManual(e.target.value)} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--dim)" }}>
              {scan.isFetching ? "reconciling…" : `scanned ${scan.data?.poolsScanned ?? 0} pools`}
            </span>
            {scan.isFetching && <Spinner size={11} className="ml-1" />}
            <button className="btn btn-ghost ml-auto !px-2 !py-1 text-[10px]" onClick={() => scan.refetch()} disabled={!wallet || scan.isFetching}>
              refresh
            </button>
          </div>
        </div>

        {/* starter drip (H31–33): appears for connected wallets with no gas */}
        {connected && balance.data && balance.data.cook < 0.01 && (
          <div className="border-b p-3" style={{ borderColor: "var(--line)", background: "var(--honey-dim)" }}>
            <div className="flex items-center gap-2">
              <span className="text-[16px]" aria-hidden>
                🚰
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold" style={{ color: "var(--honey2)" }}>
                  no COOK for gas? starter drip
                </p>
                <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                  0.05 COOK, once per wallet (on-chain memo ledger). Claims stay gasless either way.
                </p>
              </div>
              <button className="btn btn-honey !px-2.5 !py-1.5 text-[10.5px]" disabled={busy} onClick={drip}>
                {busy ? "…" : "drip me"}
              </button>
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="tabs m-3 grid grid-cols-3" role="tablist">
          <span className="thumb" style={{ width: "calc((100% - 6px - 4px)/3)", transform: `translateX(calc(${tab === "positions" ? 0 : tab === "claims" ? 1 : 2} * (100% + 2px)))` }} />
          <button role="tab" aria-selected={tab === "positions"} onClick={() => setTab("positions")}>
            positions {positions.length > 0 ? `(${positions.length})` : ""}
          </button>
          <button role="tab" aria-selected={tab === "claims"} onClick={() => setTab("claims")}>
            claims {claims.length > 0 ? `(${claims.length})` : ""}
          </button>
          <button role="tab" aria-selected={tab === "creator"} onClick={() => setTab("creator")}>
            creator {created.length > 0 ? `(${created.length})` : ""}
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!wallet && (
            <p className="p-6 text-center text-[11.5px]" style={{ color: "var(--dim)" }}>
              connect a wallet (or paste an address) to derive every UserPosition PDA it holds.
            </p>
          )}
          {wallet && scan.isLoading && (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5 border-b pb-2.5" style={{ borderColor: "var(--line)" }}>
                  <Skeleton h={12} w="40%" />
                  <Skeleton h={9} w="85%" />
                  <Skeleton h={9} w="70%" />
                </div>
              ))}
            </div>
          )}
          {wallet && scan.isError && (
            <p className="p-4 text-center text-[11.5px]" style={{ color: "var(--coral)" }}>
              scan failed: {(scan.error as Error).message}
            </p>
          )}

          {wallet && !scan.isLoading && tab === "positions" && (
            <>
              {positions.length === 0 && (
                <p className="p-6 text-center text-[11.5px]" style={{ color: "var(--dim)" }}>
                  no launchpad positions — a position exists only after a bonding-curve buy.
                </p>
              )}
              {positions.map((v) => (
                <PositionRow key={v.pool} v={v} onAct={act} busy={busy} />
              ))}
            </>
          )}

          {wallet && !scan.isLoading && tab === "claims" && (
            <>
              {claims.length === 0 && (
                <p className="p-6 text-center text-[11.5px]" style={{ color: "var(--dim)" }}>
                  nothing claimable right now — graduated tokens, refunds and prizes surface here the moment a pool settles.
                </p>
              )}
              {claims.map((v) => (
                <PositionRow key={v.pool} v={v} onAct={act} busy={busy} />
              ))}
            </>
          )}

          {wallet && !scan.isLoading && tab === "creator" && (
            <>
              {created.length === 0 && (
                <p className="p-6 text-center text-[11.5px]" style={{ color: "var(--dim)" }}>
                  this wallet created no pools.
                </p>
              )}
              {created.map((c) => (
                <div key={c.pool} className="border-b p-2.5" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center gap-2">
                    <b style={{ color: "var(--honey2)" }}>{c.symbol}</b>
                    <span className={`badge badge-${c.status}`}>{c.status}</span>
                    <button className="btn ml-auto !px-2 !py-1 text-[10px]" disabled={!connected || busy} title={connected ? "gasless via relayer when available" : "connect first"} onClick={() => claimCreatorFees(c.pool)}>
                      claim fees
                    </button>
                  </div>
                  <div className="num mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                    fees {c.unclaimedFeesCook} COOK{c.unclaimedVestTokens ? ` · vest ${c.unclaimedVestTokens} tokens outstanding` : ""}
                  </div>
                  <p className="num mt-0.5 truncate text-[10px]" style={{ color: "var(--dim)" }}>
                    {c.pool}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>

        {/* totals footer */}
        {totals && (
          <div className="border-t p-3" style={{ borderColor: "var(--line2)", background: "var(--bg2)" }}>
            <div className="num grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span style={{ color: "var(--dim)" }}>invested</span>
              <span className="text-right">{totals.investedCookUi} COOK</span>
              <span style={{ color: "var(--dim)" }}>withdrawn</span>
              <span className="text-right">{totals.withdrawnCookUi} COOK</span>
              <span style={{ color: "var(--dim)" }}>live exit value</span>
              <span className="text-right" style={{ color: "var(--jade)" }}>
                {totals.liveValueCookUi} COOK
              </span>
              <span style={{ color: "var(--dim)" }}>pending actions</span>
              <span className="text-right" style={{ color: totals.actionsPending > 0 ? "var(--honey)" : "var(--text)" }}>
                {totals.actionsPending}
              </span>
              <span style={{ color: "var(--dim)" }}>creator fees</span>
              <span className="text-right">{rawToUi(BigInt(totals.unclaimedCreatorFeesRaw ?? "0"), C.COOK_DECIMALS)} COOK</span>
            </div>
            {connected && claims.length + created.length > 1 && (
              <button className="btn btn-honey mt-2 w-full !py-2" disabled={busy} onClick={sweep} title="sequential sponsored claims, one ribbon">
                {busy ? "sweeping…" : `⚡ sweep ${claims.length + created.length} pending actions`}
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
