"use client";

/**
 * Pre-trade safety layer (judge bar): mint authority, transfer hooks, impostor mints,
 * registry verification — each rendered as a state chip with an honest tooltip. Never blocks;
 * always informs. Unknown ≠ safe: failures render amber "unverified", not green.
 */
import { useSafety } from "@/hooks/useFeed";
import { Dot, Skeleton } from "./ui";

function Check({
  label,
  tone,
  detail,
  loading,
}: {
  label: string;
  tone: "ok" | "warn" | "bad";
  detail: string;
  loading?: boolean;
}) {
  if (loading) return <Skeleton h={18} w={110} />;
  return (
    <span className="chip" title={detail} style={tone === "bad" ? { borderColor: "rgba(255,107,122,.5)" } : tone === "warn" ? { borderColor: "rgba(245,165,36,.5)" } : { borderColor: "rgba(111,227,165,.4)" }}>
      <Dot tone={tone} />
      {label}
    </span>
  );
}

export function SafetyRow({ mint, symbol }: { mint: string; symbol: string }) {
  const safety = useSafety(mint, symbol);
  const d = safety.data;
  const loading = safety.isLoading;

  const mintAuth = !d
    ? undefined
    : d.mintAuthority === null
      ? { tone: "ok" as const, label: "mint renounced", detail: "mint authority renounced — supply is fixed" }
      : d.mintAuthority === undefined
        ? { tone: "warn" as const, label: "mint unknown", detail: "mint account unreadable — treat as unverified" }
        : { tone: "bad" as const, label: "mint ACTIVE", detail: `mint authority live: ${d.mintAuthority} — supply can be inflated` };

  const hook = !d
    ? undefined
    : d.transferHook.present
      ? { tone: "warn" as const, label: "transfer hook", detail: `Token-2022 transfer hook installed${d.transferHook.programId ? `: ${d.transferHook.programId}` : ""} — transfers run extra program logic` }
      : { tone: "ok" as const, label: "no hooks", detail: d.tokenProgramName === "Token-2022" ? "Token-2022 mint, no transfer hook extension" : "SPL Token mint — no hook capability" };

  const impostor = !d
    ? undefined
    : d.impostors.length > 0
      ? { tone: "warn" as const, label: `${d.impostors.length} lookalike${d.impostors.length > 1 ? "s" : ""}`, detail: `same symbol in registry: ${d.impostors.map((i) => `${i.name} ${i.mint.slice(0, 8)}…`).join(", ")} — verify the mint before trading` }
      : { tone: "ok" as const, label: "symbol unique", detail: "no other registry asset shares this symbol" };

  const registry = !d
    ? undefined
    : d.registryVerified
      ? { tone: "ok" as const, label: "registry ✓", detail: "mint is listed in the CookieScan token registry" }
      : { tone: "warn" as const, label: "not in registry", detail: "mint absent from CookieScan registry — extra caution" };

  return (
    <div className="panel flex flex-wrap items-center gap-1.5 px-3 py-2" aria-label="token safety checks">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--dim)" }}>
        safety
      </span>
      <Check loading={loading} {...(mintAuth ?? { tone: "idle" as never, label: "", detail: "" })} />
      <Check loading={loading} {...(hook ?? { tone: "idle" as never, label: "", detail: "" })} />
      <Check loading={loading} {...(impostor ?? { tone: "idle" as never, label: "", detail: "" })} />
      <Check loading={loading} {...(registry ?? { tone: "idle" as never, label: "", detail: "" })} />
      {d?.tokenProgramName === "Token-2022" && <span className="badge badge-neutral">token-2022</span>}
      <span className="num ml-auto hidden text-[10px] md:inline" style={{ color: "var(--dim)" }} title="mint address">
        {mint.slice(0, 6)}…{mint.slice(-4)}
      </span>
    </div>
  );
}
