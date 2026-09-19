# Superteam Earn submission — field values (H47–48)

Submit ≥24h before the deadline (listing says ~Sept 22; sponsor mentions Sept 28 — treat the
earlier as binding). Buffer exists for review-queue issues.

| Field | Value |
|---|---|
| Project name | MomoPulse |
| Tagline | The launchpad terminal for Cookie Chain — sees the curve positions no wallet can |
| Live URL | <vercel-url> (CI deploys every merge; `vercel.json` in repo) |
| GitHub | <repo-url> (public, MIT, 4 phase-tagged commits + clean history) |
| Demo video | <mp4-url> (90s, script: `docs/demo-script.md`) + GIF for registry |
| X thread | <thread-url> (includes required bridge guide, tags @TheCookieChain) |
| Telegram | posted in TheCookieNetChain — <tg-url> |
| Registry PR | <pr-url> |
| **App wallet / referral** | `<NEXT_PUBLIC_COOKIE_REFERRER value>` (disclosed in-UI on every buy) |
| **Relayer hot wallet** | `<relayer pubkey from RELAYER_SECRET>` (feePayer sponsor; spend ledger = on-chain memos `MOMOPULSE_RELAY:v1:*`) |
| **Drip wallet** | same as relayer (ledger memos `MOMOPULSE_DRIP:v1:*`) |
| Programs deployed | none — non-custodial client + serverless relayer (no program risk to review) |
| Key contract addresses used | launchpad `momoL7wu…Doqcw` (runtime-resolved per pool), WCOOK `So111…112`, genesis `9wDaBRDg…cBB2` |

## Evidence to attach

1. `docs/error-states/matrix.log` — executed failure-recovery matrix (10 rows, live mainnet)
2. `scripts/e2e-tx.ts` output — manifest-verified builds + successful simulations (buy 106,717 CU;
   claim 43,028 CU) + relay RELAYABLE verdict, all against live mainnet state
3. Test suite: 111/111 (golden curve vectors ported MIT from cookie-mcp + relay/copilot/quote suites)
4. Screenshots ×3 + banner + logo (assets/)
5. Funding-honesty note: landings require COOK; no faucet exists. Pipeline is simulation-proven;
   relayer/drip activate on hot-wallet funding (documented in README runbook).

## Pre-submit checklist

- [ ] Vercel deployment is the `main` HEAD (live URL = submitted URL)
- [ ] X thread posted ≥1h before submission (links resolve)
- [ ] TG post live
- [ ] registry PR opened (not merged-required)
- [ ] README renders as front door (architecture, security model, evidence tables)
- [ ] submission screenshot saved for your records
