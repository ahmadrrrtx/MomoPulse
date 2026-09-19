"use client";

/** Watches the pool feed for phase transitions and fires radar events + violet toasts. */
import { useEffect, useRef } from "react";
import { poolPhase } from "@/core/phases";
import { useRadar } from "@/store/radar";
import { toast } from "@/store/toasts";
import type { LaunchpadPool } from "@/core/types";

const ALERT_WORTHY = new Set(["graduated", "ended", "expired"]);

export function useRadarWatcher(pools: LaunchpadPool[] | undefined) {
  const prev = useRef<Map<string, string> | null>(null);
  const push = useRadar((s) => s.push);

  useEffect(() => {
    if (!pools) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const next = new Map(pools.map((p) => [p.pubkey, poolPhase(p, nowSec)]));
    if (prev.current) {
      for (const [pubkey, phase] of next) {
        const before = prev.current.get(pubkey);
        if (before && before !== phase) {
          const pool = pools.find((p) => p.pubkey === pubkey);
          const ev = { pool: pubkey, symbol: pool?.symbol ?? pubkey.slice(0, 6), from: before, to: phase, ts: Date.now() };
          push(ev);
          if (ALERT_WORTHY.has(phase)) {
            toast.info(
              phase === "graduated" ? `🎓 ${ev.symbol} GRADUATED` : `${ev.symbol} settled → ${phase}`,
              phase === "graduated"
                ? "curve closed — SPL token claims are live. Sweep them from the drawer."
                : `phase ${before} → ${phase}: check claims/refunds in the drawer`,
              { tone: "violet", ttl: 12_000 },
            );
          }
        }
      }
    }
    prev.current = next;
  }, [pools, push]);
}
