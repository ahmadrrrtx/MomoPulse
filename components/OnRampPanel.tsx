"use client";

/**
 * On-ramp (H21–22): the path most users actually need — Cookie Chain has no faucet and COOK
 * gas is the #1 reported pain. Jupiter → sCOOK → Hyperlane bridge → native COOK → trade,
 * plus the Nightly RPC setup card and a live bridge-reachability probe.
 */
import { useBridgeStatus } from "@/hooks/useFeed";
import { C } from "@/core/constants";
import { CopyButton, Dot } from "./ui";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 border-b p-3 last:border-b-0" style={{ borderColor: "var(--line)" }}>
      <span
        className="num flex h-6 w-6 shrink-0 items-center justify-center text-[11px] font-bold"
        style={{ border: "1px solid var(--honey)", color: "var(--honey)", boxShadow: "var(--glow)" }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold tracking-wide" style={{ color: "var(--text)" }}>
          {title}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

export function OnRampPanel() {
  const bridge = useBridgeStatus();
  const jup = `https://jup.ag/swap/SOL-${C.SCOOK_MINT_SOLANA}`;

  return (
    <section className="panel" aria-label="get COOK on Cookie Chain">
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>
          get cook · on-ramp
        </h2>
        <span className="chip" title="Hyperlane bridge reachability probe">
          <Dot tone={bridge.isLoading ? "idle" : bridge.data?.ok ? "ok" : "bad"} />
          bridge {bridge.data?.ok ? (bridge.data.ms != null ? `${bridge.data.ms}ms` : "up") : "down"}
        </span>
      </div>

      <Step n={1} title="Buy sCOOK on Solana (Jupiter)">
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Swap SOL/USDC → <b className="num">sCOOK</b> (bridged COOK, Token-2022, 6 dec) on Jupiter with the mint
          pre-filled.
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <a className="btn btn-ghost flex-1 !py-2 text-[11px]" href={jup} target="_blank" rel="noreferrer">
            open jupiter ↗
          </a>
          <CopyButton value={C.SCOOK_MINT_SOLANA} label="sCOOK mint" />
        </div>
      </Step>

      <Step n={2} title="Bridge sCOOK → COOK (1:1, instant)">
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Hyperlane wraps sCOOK into native Cookie Chain COOK at 1:1 — seconds, not minutes. No faucet exists;
          this is the only on-ramp.
        </p>
        <a className="btn btn-ghost mt-1.5 w-full !py-2 text-[11px]" href={C.BRIDGE} target="_blank" rel="noreferrer">
          open hyperlane bridge ↗
        </a>
      </Step>

      <Step n={3} title="Point Nightly at Cookie Chain">
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Nightly wallet → Networks → Add custom network. Then connect above; MomoPulse verifies the genesis hash
          before any action.
        </p>
        <div className="mt-1.5 space-y-1">
          {[
            ["network", "Cookie Chain"],
            ["rpc url", C.RPC],
            ["explorer", C.EXPLORER],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-14 shrink-0 text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--dim)" }}>
                {k}
              </span>
              <code className="num min-w-0 flex-1 truncate text-[10.5px]" style={{ color: "var(--honey2)" }}>
                {v}
              </code>
              <CopyButton value={v} label={k} className="!p-1" />
            </div>
          ))}
        </div>
      </Step>

      <div className="p-3">
        <p className="text-[10.5px]" style={{ color: "var(--dim)" }}>
          ⛽ gasless claims (fee-sponsored relayer + starter drip) ship in Phase 3 — Cookie Chain fees are ~5×10⁻⁶ COOK,
          so sponsorship is effectively free; abuse-control is the real problem, and it is designed.
        </p>
      </div>
    </section>
  );
}
