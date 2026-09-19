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
import { rawToUi } from "@/core/format";
import { C } from "@/core/constants";
import { CopyButton, Skeleton, Spinner } from "./ui";
import type { PositionView } from "@/core/positions";

type Tab = "positions" | "claims" | "creator";

function ActionButton({ v }: { v: PositionView }) {
  if (!v.action) return <span className="num text-[10px]" style={{ color: "var(--dim)" }}>hold</span>;
  const label =
    v.action.kind === "sell"
      ? "sell"
      : v.action.kind === "graduated_tokens"
        ? "claim tokens"
        : v.action.kind === "fair"
          ? "claim refund"
          : v.action.kind === "winner"
            ? "claim prize"
            : v.action.kind === "creator_fees"
              ? "claim fees"
              : v.action.kind;
  return (
    <button className="btn !px-2 !py-1 text-[10px]" disabled title={`${v.action.reason} — signing ships in Phase 3`}>
      {label} 
    </button>
  );
}

function PositionRow({ v }: { v: PositionView }) {
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
          <ActionButton v={v} />
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
                <PositionRow key={v.pool} v={v} />
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
                <PositionRow key={v.pool} v={v} />
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
                    <button className="btn ml-auto !px-2 !py-1 text-[10px]" disabled title="claim-creator-fees tx ships in Phase 3">
                      claim fees ⏸
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
          </div>
        )}
      </aside>
    </>
  );
}
