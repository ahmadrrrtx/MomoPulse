"use client";

/**
 * Phase 1 terminal landing — engine proof: live pool feed (Stage 1) + true-position scanner
 * (Stages 1–5). The full execution grid lands in Phase 2; this page exists to demo the indexer
 * end-to-end from the browser with the same code path as the CLI.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Header } from "@/components/Header";
import { C } from "@/core/constants";
import type { WalletScanResult } from "@/core/pipeline";
import type { LaunchpadPool } from "@/core/types";

const PHASE_COLOR: Record<string, string> = {
  live: "mp-green",
  graduated: "mp-neon",
  ended: "mp-amber",
  expired: "mp-red",
};

function PoolsFeed() {
  const { data, isLoading, error } = useQuery<{ pools: LaunchpadPool[] }>({
    queryKey: ["pools", "all"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await fetch("/api/pools?status=all");
      if (!res.ok) throw new Error(`pools ${res.status}`);
      return res.json();
    },
  });

  return (
    <section className="mp-panel flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--mp-line)" }}>
        <h2 className="text-[11px] uppercase tracking-widest mp-dim">Launchpad pool feed · stage 1</h2>
        <span className="mp-chip">{data?.pools.length ?? 0} pools</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-3 mp-dim">loading pools…</p>}
        {error && <p className="p-3 mp-red">feed error: {(error as Error).message}</p>}
        {data?.pools.map((p) => {
          const raised = Number(p.paymentRaisedNet ?? 0) / 1e9;
          const target = Number(p.graduationTarget ?? C.GRADUATION_TARGET_FALLBACK) / 1e9;
          const pct = target > 0 ? (raised / target) * 100 : 0;
          return (
            <a
              key={p.pubkey}
              href={`https://momoswap.fun/pool/${p.pubkey}`}
              target="_blank"
              rel="noreferrer"
              className="block border-b px-3 py-2 hover:bg-white/[0.03]"
              style={{ borderColor: "var(--mp-line)" }}
            >
              <div className="flex items-center gap-2">
                <b className="mp-neon">{p.symbol}</b>
                <span className={`text-[10px] uppercase ${PHASE_COLOR[p.status] ?? "mp-dim"}`}>{p.status}</span>
                {p.expiryMode && p.expiryMode !== "dead" && (
                  <span className="text-[10px] uppercase mp-dim">· {p.expiryMode}</span>
                )}
                <span className="ml-auto text-[10px] mp-dim">{p.participantCount ?? 0} holders</span>
              </div>
              <div className="mt-1 h-1 w-full" style={{ background: "var(--mp-panel2)" }}>
                <div
                  className="h-1"
                  style={{ width: `${Math.min(pct, 100)}%`, background: "var(--mp-neon)", boxShadow: "var(--mp-glow)" }}
                />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] mp-dim">
                <span>
                  {raised.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {target.toLocaleString(undefined, { maximumFractionDigits: 0 })} COOK
                </span>
                <span>{pct.toFixed(2)}% to graduation</span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function ScanResult({ scan }: { scan: WalletScanResult }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] mp-dim">
        scanned {scan.poolsScanned} pools in {(scan.scannedAt / 1000) | 0} · program ids resolved per pool
      </p>
      {scan.positions.length === 0 && scan.created.length === 0 && (
        <p className="mp-dim">No launchpad positions. Curve shares exist only after a bonding-curve buy (UserPosition PDA per pool).</p>
      )}
      {scan.positions.map((v) => (
        <div key={v.pool} className="mp-panel p-3">
          <div className="flex items-center gap-2">
            <b className="mp-neon">{v.symbol}</b>
            <span className={`text-[10px] uppercase ${PHASE_COLOR[v.status] ?? "mp-dim"}`}>{v.status}</span>
            {v.action && (
              <span className="ml-auto mp-chip mp-amber">▶ {v.action.kind}</span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
            <dt className="mp-dim">shares (curve)</dt>
            <dd className="text-right">{v.sharesUi}</dd>
            <dt className="mp-dim">invested / withdrawn</dt>
            <dd className="text-right">
              {v.investedUi} / {v.withdrawnUi} COOK
            </dd>
            {v.exitValueUi !== null && (
              <>
                <dt className="mp-dim">exit value (exact quoteSell)</dt>
                <dd className="text-right mp-green">{v.exitValueUi} COOK</dd>
                <dt className="mp-dim">pnl</dt>
                <dd className={`text-right ${(v.pnlRaw ?? "0").startsWith("-") ? "mp-red" : "mp-green"}`}>
                  {v.pnlUi} COOK{v.pnlPct !== null ? ` (${v.pnlPct.toFixed(2)}%)` : ""}
                </dd>
              </>
            )}
            {v.creatorFeeUi && (
              <>
                <dt className="mp-dim">creator fees unclaimed</dt>
                <dd className="text-right mp-amber">{v.creatorFeeUi} COOK</dd>
              </>
            )}
            {v.vestRemainingUi && (
              <>
                <dt className="mp-dim">creator vest outstanding</dt>
                <dd className="text-right">{v.vestRemainingUi}</dd>
              </>
            )}
          </dl>
          {v.action && <p className="mt-2 text-[11px] mp-dim">{v.action.reason}</p>}
        </div>
      ))}
      {scan.created.length > 0 && (
        <div className="mp-panel p-3">
          <p className="text-[11px] uppercase tracking-widest mp-dim">pools created by this wallet</p>
          {scan.created.map((c) => (
            <p key={c.pool} className="mt-1 text-[12px]">
              <b className="mp-neon">{c.symbol}</b> <span className="mp-dim">[{c.status}]</span> fees {c.unclaimedFeesCook} COOK
              {c.unclaimedVestTokens ? ` · vest ${c.unclaimedVestTokens}` : ""}
            </p>
          ))}
        </div>
      )}
      <p className="text-[12px]">
        TOTALS · invested <b>{scan.totals.investedCookUi}</b> · withdrawn <b>{scan.totals.withdrawnCookUi}</b> · live exit value{" "}
        <b className="mp-green">{scan.totals.liveValueCookUi} COOK</b> · actions <b className="mp-amber">{scan.totals.actionsPending}</b>
      </p>
      {scan.notes.map((n) => (
        <p key={n} className="text-[11px] mp-amber">
          {n}
        </p>
      ))}
    </div>
  );
}

function Scanner() {
  const { publicKey } = useWallet();
  const [wallet, setWallet] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const scan = useQuery<WalletScanResult>({
    queryKey: ["scan", submitted],
    enabled: !!submitted,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/scan?wallet=${encodeURIComponent(submitted!)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `scan ${res.status}`);
      return json;
    },
  });

  const useConnected = () => {
    if (publicKey) {
      setWallet(publicKey.toBase58());
      setSubmitted(publicKey.toBase58());
    }
  };

  return (
    <section className="mp-panel p-3">
      <h2 className="text-[11px] uppercase tracking-widest mp-dim">True-position scanner · stages 1–5</h2>
      <div className="mt-2 flex gap-2">
        <input
          className="mp-input"
          placeholder="wallet address (base58)"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && wallet && setSubmitted(wallet)}
        />
        <button className="mp-btn shrink-0" disabled={!wallet || scan.isFetching} onClick={() => setSubmitted(wallet)}>
          {scan.isFetching ? "scanning…" : "scan"}
        </button>
        <button className="mp-btn shrink-0" disabled={!publicKey} onClick={useConnected} title={publicKey ? "scan connected wallet" : "connect a wallet first"}>
          mine
        </button>
      </div>
      {scan.error && <p className="mt-2 mp-red">scan error: {(scan.error as Error).message}</p>}
      <div className="mt-3">{submitted && scan.data && <ScanResult scan={scan.data} />}</div>
      <p className="mt-3 text-[10px] mp-dim">
        same engine as the CLI: <code>npx tsx scripts/positions.ts &lt;wallet&gt;</code> · curve shares are NOT SPL tokens —
        no wallet or explorer shows them; MomoPulse derives every UserPosition PDA and values it with the program-exact
        quoteSell math.
      </p>
    </section>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <PoolsFeed />
        <div className="flex min-h-0 flex-col gap-4">
          <Scanner />
          <section className="mp-panel p-3">
            <h2 className="text-[11px] uppercase tracking-widest mp-dim">Why this exists</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[12px] mp-dim">
              <li>
                Pre-graduation launchpad buys mint <b className="mp-text">curve shares</b> tracked in a per-pool PDA — invisible to
                every wallet, block explorer and portfolio tracker.
              </li>
              <li>
                Settled pools hide money: graduated pools owe <b className="mp-text">SPL token claims</b>, expired fair pools owe{" "}
                <b className="mp-text">refunds</b>, jackpot/survivor pools owe <b className="mp-text">winner payouts</b>.
              </li>
              <li>
                Exit value is NOT shares × spot — the bonding curve + 1% fee means the realizable amount is the program-exact{" "}
                <code className="mp-neon">quoteSell</code>, which MomoPulse computes locally from on-chain state.
              </li>
            </ul>
            <p className="mt-2 text-[10px] mp-dim">
              chain: Cookie Chain (SVM) · genesis {C.GENESIS_HASH.slice(0, 12)}… verified per session · data: momoswap.fun API +
              rpc.cookiescan.io
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
