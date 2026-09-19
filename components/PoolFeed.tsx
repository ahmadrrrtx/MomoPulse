"use client";

/**
 * Left feed (H10–13): searchable, sortable, filterable pool cards with progress, phase/mode
 * badges, countdown and anti-snipe/min/max flags. 5s refresh with visible freshness; skeleton
 * on first load, honest empty state when filters match nothing.
 */
import { useMemo } from "react";
import { usePoolFeed, useTokenMeta } from "@/hooks/useFeed";
import { useTerminal, type FeedFilter, type FeedSort } from "@/store/terminal";
import { C } from "@/core/constants";
import { poolPhase } from "@/core/phases";
import { graduationProgressPct } from "@/core/curve";
import { countdownLabel, Dot, Skeleton, TokenAvatar, useNow } from "./ui";
import type { LaunchpadPool } from "@/core/types";

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "live", label: "live" },
  { id: "all", label: "all" },
  { id: "graduated", label: "grad" },
  { id: "settled", label: "settled" },
];
const SORTS: { id: FeedSort; label: string }[] = [
  { id: "raised", label: "raised" },
  { id: "ending", label: "ending" },
  { id: "newest", label: "new" },
  { id: "holders", label: "holders" },
];

function matches(p: LaunchpadPool, f: FeedFilter, nowSec: number): boolean {
  const phase = poolPhase(p, nowSec);
  if (f === "live") return phase === "live";
  if (f === "graduated") return phase === "graduated";
  if (f === "settled") return phase === "ended" || phase === "expired";
  return true;
}

export function PoolFeed() {
  const feed = usePoolFeed();
  const now = useNow(1_000);
  const nowSec = Math.floor(now / 1000);
  const { selectedPool, selectPool, feedFilter, setFeedFilter, feedSort, setFeedSort, feedQuery, setFeedQuery } =
    useTerminal();

  const pools = useMemo(() => {
    const list = (feed.data?.pools ?? []).filter((p) => matches(p, feedFilter, nowSec));
    const q = feedQuery.trim().toLowerCase();
    const searched = q
      ? list.filter(
          (p) =>
            p.symbol.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.pubkey.toLowerCase().includes(q) ||
            p.creator.toLowerCase().includes(q),
        )
      : list;
    const raised = (p: LaunchpadPool) => Number(p.paymentRaisedNet ?? 0);
    const sorted = [...searched];
    if (feedSort === "raised") sorted.sort((a, b) => raised(b) - raised(a));
    if (feedSort === "holders")
      sorted.sort((a, b) => (Number(b.participantCount) || 0) - (Number(a.participantCount) || 0));
    if (feedSort === "newest") sorted.sort((a, b) => b.launchTs - a.launchTs);
    if (feedSort === "ending")
      sorted.sort((a, b) => {
        const pa = poolPhase(a, nowSec) === "live" ? a.endTs : Infinity;
        const pb = poolPhase(b, nowSec) === "live" ? b.endTs : Infinity;
        return pa - pb;
      });
    return sorted;
  }, [feed.data, feedFilter, feedSort, feedQuery, nowSec]);

  const stale = feed.isFetching;

  return (
    <section className="panel flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="border-b p-2" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center gap-2">
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>
            pool feed
          </h2>
          <span className="chip num ml-auto" title="feed freshness">
            <Dot tone={feed.isError ? "bad" : "ok"} />
            {stale ? <span className="spin inline-block">◌</span> : `${pools.length}`}
          </span>
        </div>
        <input
          className="input mt-2"
          placeholder="search symbol, mint, creator…"
          value={feedQuery}
          onChange={(e) => setFeedQuery(e.target.value)}
          aria-label="search pools"
        />
        <div className="mt-2 flex gap-2">
          <div className="tabs grid flex-1" style={{ gridTemplateColumns: `repeat(${FILTERS.length},1fr)` }} role="tablist">
            <span
              className="thumb"
              style={{
                width: `calc((100% - 6px - ${(FILTERS.length - 1) * 2}px) / ${FILTERS.length})`,
                transform: `translateX(calc(${FILTERS.findIndex((f) => f.id === feedFilter)} * (100% + 2px)))`,
              }}
            />
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={feedFilter === f.id} onClick={() => setFeedFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <select
            className="input !w-auto !py-1.5 text-[11px] uppercase"
            value={feedSort}
            onChange={(e) => setFeedSort(e.target.value as FeedSort)}
            aria-label="sort pools"
            style={{ background: "var(--bg2)" }}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feed.isLoading && (
          <div className="stagger space-y-2 p-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ ["--i" as string]: i }} className="p-2.5" >
                <div className="flex items-center gap-2.5">
                  <Skeleton w={34} h={34} />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton h={11} w="55%" />
                    <Skeleton h={9} w="80%" />
                  </div>
                </div>
                <Skeleton className="mt-2" h={5} />
              </div>
            ))}
          </div>
        )}

        {feed.isError && (
          <div className="p-4 text-center">
            <p className="text-[12px]" style={{ color: "var(--coral)" }}>
              feed unreachable — {(feed.error as Error).message}
            </p>
            <button className="btn btn-ghost mt-2" onClick={() => feed.refetch()}>
              retry
            </button>
          </div>
        )}

        {!feed.isLoading && !feed.isError && pools.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-[22px]" aria-hidden>
              🍪
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
              no pools match “{feedQuery || feedFilter}”
            </p>
            <button
              className="btn btn-ghost mt-2"
              onClick={() => {
                setFeedQuery("");
                setFeedFilter("all");
              }}
            >
              clear filters
            </button>
          </div>
        )}

        <div className="stagger">
          {pools.map((p, i) => (
            <PoolCard key={p.pubkey} pool={p} index={i} nowSec={nowSec} selected={selectedPool === p.pubkey} onSelect={() => selectPool(p.pubkey)} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PoolCard({
  pool,
  index,
  nowSec,
  selected,
  onSelect,
}: {
  pool: LaunchpadPool;
  index: number;
  nowSec: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const phase = poolPhase(pool, nowSec);
  const meta = useTokenMeta(pool.uri);
  const target = Number(pool.graduationTarget || C.GRADUATION_TARGET_FALLBACK);
  const pct = graduationProgressPct(pool.paymentRaisedNet, pool.graduationTarget || C.GRADUATION_TARGET_FALLBACK);
  const raisedCook = Number(pool.paymentRaisedNet) / 1e9;
  const left = countdownLabel(pool.endTs, nowSec * 1000);
  const minBuy = Number(pool.minBuy ?? 0) / 1e9;
  const maxBuy = Number(pool.maxBuyPerWallet ?? 0) / 1e9;

  return (
    <button
      className="card border-b"
      style={{ ["--i" as string]: Math.min(index, 8), borderColor: undefined }}
      data-selected={selected}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="flex items-center gap-2.5">
        <TokenAvatar uri={meta.data?.image} symbol={pool.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <b className="truncate text-[13.5px] tracking-wide" style={{ color: "var(--text)" }}>
              {pool.symbol}
            </b>
            <span className="num truncate text-[10px]" style={{ color: "var(--dim)" }}>
              {pool.name}
            </span>
            <span className={`badge badge-${phase} ml-auto shrink-0`}>{phase}</span>
          </div>
          <div className="num mt-0.5 flex items-center gap-2 text-[10.5px]" style={{ color: "var(--muted)" }}>
            <span>
              {raisedCook.toLocaleString(undefined, { maximumFractionDigits: 0 })} /{" "}
              {(target / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })} COOK
            </span>
            <span style={{ color: "var(--dim)" }}>·</span>
            <span>{pool.participantCount ?? 0} holders</span>
            {pool.expiryMode !== "dead" && (
              <span className="badge badge-neutral" title={`on expiry: ${pool.expiryMode}`}>
                {pool.expiryMode}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={`bar mt-2 ${phase === "graduated" ? "bar-jade" : ""}`}>
        <i style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="num mt-1 flex items-center justify-between text-[10px]" style={{ color: "var(--dim)" }}>
        <span style={{ color: pct >= 100 ? "var(--jade)" : "var(--honey2)" }}>{pct.toFixed(2)}% → grad</span>
        <span className="flex items-center gap-2">
          {pool.antiSnipe && (
            <span title="anti-snipe: first-block buys capped" style={{ color: "var(--sky)" }}>
              ⚡snipe-guard
            </span>
          )}
          {(minBuy > 0 || maxBuy > 0) && (
            <span title={`min ${minBuy} / max ${maxBuy} COOK per wallet`}>
              {minBuy > 0 ? `${minBuy}↧` : ""}
              {minBuy > 0 && maxBuy > 0 ? "/" : ""}
              {maxBuy > 0 ? `${maxBuy}↥` : ""}
            </span>
          )}
          {phase === "live" && left && (
            <span style={{ color: "var(--honey2)" }}>⏳ {left}</span>
          )}
        </span>
      </div>
    </button>
  );
}
