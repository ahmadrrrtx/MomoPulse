/**
 * Launchpad program error translation + simulation-failure diagnosis.
 * Ported from cookiechain/cookie-mcp (MIT) src/core/launchpad/program.ts + index.ts @ v0.5.0.
 *
 * ⚠ The launchpad's committed IDL disagrees with its own Rust source and is WRONG: the IDL lists
 * SlippageExceeded at 6019 and shifts the 27 codes after it, while the source has it at 6046 with
 * 6000–6045 untouched. Anchor codes are the compiled enum discriminants — the SOURCE wins. This
 * table is source-verified. Codes are stable across deployments because the program follows an
 * append-only error policy.
 */
import { MomoPulseError } from "./errors";

/** Agent-actionable program errors — one table for every launchpad deployment. */
export const LAUNCHPAD_ERRORS: Record<number, string> = {
  6000: "the launchpad is paused",
  6011: "the pool is not in a tradeable state (it has graduated or expired)",
  6012: "trading has not opened yet for this launch",
  6013: "the launch has ended — the pool is expired",
  6015: "the amount is below the pool's minimum buy",
  6016: "this buy would exceed the pool's per-wallet cap",
  6017: "this buy would exceed the pool's raise cap",
  6019: "the pool has no sale tokens left at this size",
  6020: "you have no bonding-curve position on this pool",
  6021: "you are trying to sell more shares than you hold",
  6022: "the pool's payment vault cannot cover this sell",
  6025: "there is nothing to claim",
  6026: "this has already been claimed",
  6035: "self-referral is not allowed",
  // Retired: audit #1 replaced this grace-window guard with 6048. Mapped anyway so an
  // unanticipated build still gets an explanation — but the text must not promise a grace window.
  6039:
    "this pool met its graduation target, so it could not be expired or claimed against yet — retired error; see 6048",
  6040: "the anti-snipe window caps how much one wallet can buy right after launch",
  // Appended by the min-out audit fix — only exists on post-audit builds.
  6046: "the trade would return less than the minimum you asked for (slippage) — the curve moved",
  // Reachable from a CLAIM, not a trade: claim lazily expires an `ended` pool first, and that
  // transition refuses a migratable pool that met its target — graduation wins over expiry.
  // Fair pools re-open after one hour; every other expiry mode after 30 days.
  6048:
    "this pool met its graduation target, so it has to graduate rather than expire — the permissionless claim/expiry path re-opens only if it doesn't (one hour after the launch ended for a fair-mode pool, 30 days for any other mode)",
};

export function launchpadErrorMessage(code: number): string | undefined {
  return LAUNCHPAD_ERRORS[code];
}

/** Pull a custom program error code out of a simulation error blob / log tail (hex or decimal). */
export function programErrorCode(blob: string): number | null {
  const m =
    blob.match(/"Custom"\s*:\s*(\d+)/) ?? blob.match(/custom program error: 0x([0-9a-f]+)/i);
  if (!m) return null;
  const raw = m[1]!;
  return m[0].includes("0x") ? parseInt(raw, 16) : parseInt(raw, 10);
}

/**
 * Anchor's framework errors (2000–3999 constraint/account range) are read FROM THE LOGS, not a
 * hardcoded table — Anchor emits name + number + message itself, so the translation cannot be
 * wrong the way a guessed enum map is.
 */
export interface AnchorLogError {
  /** The account the constraint was attached to, when Anchor names one (`caused by account: pool`). */
  account?: string;
  code: string; // e.g. `ConstraintSeeds`
  number: number; // e.g. 2006
  message?: string;
  /** For seeds/address constraints Anchor prints the two values it compared. */
  left?: string;
  right?: string;
}

/** Strip the `Program log: ` / `Program data: ` framing so a log line reads as a sentence. */
function bareLog(line: string): string {
  return line.replace(/^Program (?:log|data): /, "").trim();
}

export function anchorLogError(logs: string[] | null): AnchorLogError | null {
  if (!logs?.length) return null;
  const lines = logs.map(bareLog);
  const i = lines.findIndex((l) => l.startsWith("AnchorError"));
  if (i < 0) return null;
  const head = lines[i]!;
  const number = Number(head.match(/Error Number: (\d+)/)?.[1]);
  const code = head.match(/Error Code: ([A-Za-z0-9_]+)/)?.[1];
  if (!code || !Number.isFinite(number)) return null;
  const out: AnchorLogError = {
    code,
    number,
    account: head.match(/caused by account: ([A-Za-z0-9_]+)/)?.[1],
    message: head.match(/Error Message: (.+?)\.?$/)?.[1],
  };
  // `Left:` and `Right:` are labels; the value is on the line after each.
  for (let j = i + 1; j < lines.length; j++) {
    if (/^Left:$/.test(lines[j]!)) out.left = lines[j + 1];
    else if (/^Right:$/.test(lines[j]!)) out.right = lines[j + 1];
  }
  return out;
}

export function anchorLogSummary(e: AnchorLogError): string {
  const parts = [`${e.code} (${e.number})`];
  if (e.account) parts.push(`on the \`${e.account}\` account`);
  if (e.message) parts.push(`— ${e.message}`);
  if (e.left && e.right) parts.push(`(passed ${e.left}, program expected ${e.right})`);
  return parts.join(" ");
}

/**
 * Pick the lines from a failed simulation that actually say WHY, instead of blindly tailing:
 * start the window at the first line that explains something (AnchorError / panic / Error Code)
 * and keep going. `logs.slice(-3)` is actively misleading for constraint violations.
 */
export function diagnosticLogTail(logs: string[] | null, max = 6): string | undefined {
  if (!logs?.length) return undefined;
  const lines = logs.map(bareLog).filter((l) => l.length > 0);
  const start = lines.findIndex((l) => /^AnchorError|panicked|^Error Code:/.test(l));
  const window = start >= 0 ? lines.slice(start, start + max) : lines.slice(-Math.min(max, 3));
  return window.join(" | ") || undefined;
}

/** A caller-supplied reading of one program error code for context-specific wording. */
export interface SimCodeHint {
  message: string;
  hint: string;
}

/** Turn a failed simulation into an actionable MomoPulseError, translating known codes. */
export function launchpadSimError(
  what: string,
  err: unknown,
  logs: string[] | null,
  codeHints?: Record<number, SimCodeHint>,
): MomoPulseError {
  const blob = `${JSON.stringify(err)} ${logs?.join(" ") ?? ""}`;
  const code = programErrorCode(blob);
  const override = code != null ? codeHints?.[code] : undefined;
  if (override) return new MomoPulseError(override.message, override.hint);
  const known = code != null ? launchpadErrorMessage(code) : undefined;
  if (known) {
    return new MomoPulseError(`${what} would fail: ${known}`, "nothing was sent");
  }
  const anchor = anchorLogError(logs);
  if (anchor) {
    return new MomoPulseError(
      `${what} would fail: ${anchorLogSummary(anchor)}`,
      anchor.account
        ? `the program rejected the \`${anchor.account}\` account it was handed — the launchpad API may be building against a different deployment than the one on chain; nothing was sent`
        : "nothing was sent",
    );
  }
  if (/BlockhashNotFound|blockhash/i.test(blob)) {
    return new MomoPulseError(
      `${what} simulation failed: blockhash not found`,
      "Cookie Chain finalization may be stalled — retry shortly",
    );
  }
  if (/insufficient|0x1\b/i.test(blob)) {
    return new MomoPulseError(
      `${what} simulation failed: insufficient funds`,
      "check the wallet's COOK balance (it also pays rent for new accounts and the network fee)",
    );
  }
  const tail = diagnosticLogTail(logs);
  return new MomoPulseError(
    `${what} simulation failed${tail ? `: ${tail}` : ""}`,
    "the pool state may have changed; re-read it and retry — nothing was sent",
  );
}
