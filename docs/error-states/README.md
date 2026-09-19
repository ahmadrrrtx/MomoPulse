# Error-state matrix — failure-recovery drills (H38–40)

Every failure mode the terminal can meet, the exact user-visible UX it produces, and the
evidence run that proved it. Re-run any time with `npx tsx scripts/drills.ts`
(archived output: [`matrix.log`](./matrix.log), recorded 2026-09-19 against live mainnet).

Screenshots are replaced by **executed evidence** in this sandbox (no browser available):
each row prints the literal string the UI renders, produced by the real code path.

| # | Failure | User-visible UX | Recovery path | Evidence |
|---|---------|-----------------|---------------|----------|
| 01 | Wallet/RPC on wrong network | header chip flips to red `wrong net` + blocking banner with the mismatched genesis; all trade CTAs disabled | copy-button RPC card in on-ramp; guard re-checks on every connect | drill: Solana genesis `5eykt4Us…` ≠ Cookie `9wDaBRDg…` → guard verdict wrong-network |
| 02 | Wallet has 0 COOK for gas | toast `no COOK for gas` naming the ~5×10⁻⁶ COOK fee; drawer shows the 🚰 starter-drip card; claims stay gasless via relayer | drip (0.05 COOK, 1×/wallet) or sponsored claim | drill: `translateError("insufficient lamports…")` |
| 03 | Blockhash expired pre-sign | toast `blockhash expired` with **Rebuild & retry** action; one silent rebuild attempted first | action re-runs the whole flow | drill: stale height −508 vs fresh +142 headroom (block-HEIGHT metric, not slot) |
| 04 | User rejects signature | toast `signature rejected` — "nothing was sent"; flow exits clean, no broadcast | retry whenever | drill: mock signer throw → `runTxFlow` catch |
| 05 | Launchpad API 5xx | `network failure calling api.momoswap.fun` after bounded retry; feed keeps last-good data with freshness dot | scheduler backoff (30s cap) + retry button | drill: local mock 500 ×2 → `fetchJson` retry-then-MomoPulseError |
| 06 | DAS WebSocket drop | invisible by design: prices/series degrade to 5–15s polling; chip shows reconnect state | 15s heartbeat supervision + exp-backoff+jitter resubscribe | architecture: WS is never source of truth (`clients/ws.ts`, `clients/scheduler.ts`) |
| 07 | Token-2022 transfer hook on mint | safety row `transfer hook ⚠` chip with the hook program in tooltip; quote still shown, warning persists | user decides with full information | drill: crafted TLV (type 14) → `scanTransferHook` detects program |
| 08 | Confirmation timeout | toast `confirmation timeout` + Rebuild action + "check explorer before retrying" | explorer link; rebuild | drill: `translateError("was not confirmed within 30s")` |
| 09 | Curve moved between quote and sign | warn toast `curve moved — re-quote` with old→new expected-out; signing blocked until user accepts | re-read quote in panel, retry | drill: `expectedOutRaw` mismatch vs `requote()` |
| 10 | Impostor mint sharing a symbol | safety row `N lookalikes ⚠` chip listing registry twins; `not in registry ⚠` when absent (never fake-green) | mint copy-button + registry cross-check | drill: live registry search; safety route per-pool |

## Design rules behind every row

1. **Unknown ≠ safe.** Any check that cannot complete renders amber `unverified`, never green.
2. **Every dead end names the next action** (Rebuild, drip, explorer, re-quote) — no bare errors.
3. **Nothing silent:** toasts carry the stage machine's last stage so users know where it broke.
4. **Failures never nuke good data:** feeds/charts keep last-good state with a freshness indicator.
