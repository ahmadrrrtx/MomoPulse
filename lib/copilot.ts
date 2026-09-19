/**
 * Agent copilot — READ-ONLY (Phase 4 stretch pick P2-2).
 *
 * Five canned intents, answered deterministically from data the terminal already holds
 * (scan · balances · feed · safety). No writes, no keys, no hallucination surface: the
 * copilot is a pure function of (question, snapshot) → answer. Chosen over TP/SL limit
 * orders because it demos the indexer's knowledge with zero on-chain risk.
 *
 * Intents:
 *   holdings   "what am I holding?"            → positions summary w/ exact exit values
 *   claims     "anything to claim?"            → actionable claims + sweep hint
 *   gas        "can I pay gas?"                → native/wrapped balance + drip/relay advice
 *   radar      "what's close to graduating?"   → live pools sorted by graduation progress
 *   safety     "is <SYM> safe?"                → safety-row verdict for a symbol
 */
import type { WalletScanResult } from "@/core/pipeline";
import type { LaunchpadPool } from "@/core/types";
import type { SafetyReport } from "@/hooks/useFeed";
import { poolPhase } from "@/core/phases";
import { graduationProgressPct } from "@/core/curve";
import { C } from "@/core/constants";

export interface CopilotSnapshot {
  wallet: string | null;
  scan: WalletScanResult | null;
  balance: { cook: number; wcook: number } | null;
  pools: LaunchpadPool[];
  safetyBySymbol: Record<string, SafetyReport | undefined>;
}

export interface CopilotAnswer {
  intent: "holdings" | "claims" | "gas" | "radar" | "safety" | "unknown";
  text: string;
}

const RE = {
  holdings: /\b(hold|holdings?|positions?|portfolio|own|owns|have)\b/i,
  claims: /\b(claim|claimable|refund|prize|sweep|unsettled|owed)\b/i,
  gas: /\b(gas|fee|faucet|drip|broke|lamports|pay for)\b/i,
  radar: /\b(graduat|graduate|close to|almost|radar|watch|near)\b/i,
  safety: /\b(safe|safety|rug|hook|impostor|scam|risk|verify)\b/i,
};

export function detectIntent(q: string): CopilotAnswer["intent"] {
  if (RE.safety.test(q) && /[a-z]{2,}/i.test(q.replace(RE.safety, ""))) return "safety";
  if (RE.claims.test(q)) return "claims";
  if (RE.gas.test(q)) return "gas";
  if (RE.radar.test(q)) return "radar";
  if (RE.holdings.test(q)) return "holdings";
  if (RE.safety.test(q)) return "safety";
  return "unknown";
}

export function answer(q: string, snap: CopilotSnapshot): CopilotAnswer {
  const intent = detectIntent(q);
  const nowSec = Math.floor(Date.now() / 1000);

  switch (intent) {
    case "holdings": {
      if (!snap.wallet) return { intent, text: "connect a wallet (or paste an address in the drawer) and I'll read every UserPosition PDA it owns." };
      const ps = snap.scan?.positions ?? [];
      if (ps.length === 0) return { intent, text: `no bonding-curve positions for ${snap.wallet.slice(0, 6)}… — positions exist only after a curve buy; settled-pool claims would show under “claims”.` };
      const lines = ps.slice(0, 4).map((v) =>
        `${v.symbol}: ${v.sharesUi} shares · exit ${v.exitValueUi ?? "—"} COOK${v.pnlPct !== null ? ` (${v.pnlPct >= 0 ? "+" : ""}${v.pnlPct.toFixed(1)}%)` : ""} [${v.status}]`,
      );
      return {
        intent,
        text: `${ps.length} position(s), live exit value ${snap.scan?.totals.liveValueCookUi ?? "0"} COOK total:\n${lines.join("\n")}`,
      };
    }
    case "claims": {
      const cs = (snap.scan?.positions ?? []).filter((v) => v.action && v.action.kind !== "sell");
      const fees = (snap.scan?.created ?? []).filter((c) => c.unclaimedFeesCook !== "0");
      if (cs.length === 0 && fees.length === 0)
        return { intent, text: "nothing claimable right now. graduated tokens, fair-refunds and creator fees surface here the moment a pool settles." };
      const parts = [
        cs.length ? `${cs.length} claim(s): ${cs.map((v) => `${v.symbol} (${v.action?.kind})`).join(", ")}` : "",
        fees.length ? `creator fees on ${fees.map((f) => f.symbol).join(", ")}` : "",
      ].filter(Boolean);
      return { intent, text: `${parts.join(" · ")} — open the drawer and hit “sweep” to claim them all in one gasless flow.` };
    }
    case "gas": {
      if (!snap.balance) return { intent, text: "connect a wallet and I'll check its gas posture." };
      const { cook, wcook } = snap.balance;
      if (cook >= 0.01) return { intent, text: `yes — ${cook.toFixed(4)} COOK native (+ ${wcook.toFixed(4)} wCOOK). buys wrap wCOOK inside the trade tx automatically.` };
      return {
        intent,
        text: `no — ${cook.toFixed(4)} COOK. options: 🚰 starter drip (0.05 COOK, once per wallet, in the drawer) or gasless sponsored claims via the relayer. no faucet exists on Cookie Chain.`,
      };
    }
    case "radar": {
      const live = snap.pools
        .filter((p) => poolPhase(p, nowSec) === "live")
        .map((p) => ({ p, pct: graduationProgressPct(p.paymentRaisedNet, p.graduationTarget || C.GRADUATION_TARGET_FALLBACK) }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3);
      if (live.length === 0) return { intent, text: "no live pools right now — the radar bell will ping the moment a phase changes." };
      return {
        intent,
        text: `closest to graduation:\n${live.map((l) => `${l.p.symbol} ${l.pct.toFixed(2)}% (${l.p.participantCount} holders)`).join("\n")}\nthe bell + violet pulse fire on any live→graduated/ended/expired transition.`,
      };
    }
    case "safety": {
      const STOP = new Set(["is", "are", "the", "a", "an", "how", "what", "safe", "safety", "rug", "risky", "risk", "scam", "verify", "token", "mint", "of", "for", "me", "it", "this", "that", "look", "looks"]);
      const toks = (q.match(/\b[A-Za-z]{2,10}\b/g) ?? []).map((t) => t.toUpperCase());
      // prefer a symbol we actually know (selected pool safety row or feed), else first non-stopword
      const sym =
        toks.find((t) => snap.safetyBySymbol[t] || snap.pools.some((p) => p.symbol === t)) ??
        toks.find((t) => !STOP.has(t.toLowerCase())) ??
        "";
      const rep = snap.safetyBySymbol[sym];
      if (!rep) return { intent, text: `select a ${sym || "pool"} in the feed and I'll read its safety row (mint authority · hooks · impostors · registry).` };
      const bits = [
        rep.mintAuthority === null ? "mint renounced ✓" : rep.mintAuthority ? `MINT ACTIVE ⚠ (${rep.mintAuthority.slice(0, 6)}…)` : "mint unknown ⚠",
        rep.transferHook.present ? `transfer hook ⚠ ${rep.transferHook.programId?.slice(0, 6) ?? ""}…` : "no hooks ✓",
        rep.impostors.length > 0 ? `${rep.impostors.length} lookalike(s) ⚠` : "symbol unique ✓",
        rep.registryVerified ? "in registry ✓" : "not in registry ⚠",
      ];
      return { intent, text: `${sym}: ${bits.join(" · ")} (${rep.tokenProgramName ?? "unknown program"})` };
    }
    default:
      return {
        intent: "unknown",
        text: "I answer five things read-only: holdings · claims · gas · graduation radar · token safety. e.g. “anything to claim?”",
      };
  }
}
