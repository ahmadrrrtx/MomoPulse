# 🍪 MomoPulse

**Launchpad terminal & bonding-curve position manager for Cookie Chain (SVM).**

MomoSwap Launchpad buys mint *curve shares* tracked in a per-pool `UserPosition` PDA — invisible
to every wallet, explorer and portfolio tracker. Settled pools hide real money: graduated pools
owe SPL-token claims, expired *fair* pools owe refunds, jackpot/survivor pools owe winner
payouts, creators sit on unclaimed fee vaults and vesting. MomoPulse derives every PDA, decodes
it with genesis-verified layouts, values it with the program-exact `quoteSell` math, and tells
you the one action each position needs.

> Built for the Cookie Chain hackathon (Superteam). Phase 1 = core engine + RPC indexer.

---

## Quick start

```bash
npm install
npm run test          # 84 unit tests: golden curve vectors, PDA decoders, fees, phases, actions
npm run dev           # terminal UI on http://localhost:3000
```

### CLI — any wallet's TRUE positions from mainnet

```bash
npx tsx scripts/positions.ts <wallet-address>          # human-readable scan
npx tsx scripts/positions.ts <wallet-address> --json   # machine-readable
```

Example (the live TEST-pool creator on mainnet, 2026-09-19):

```bash
npx tsx scripts/positions.ts AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou
# TEST [live · fair] — shares 29506.688566 (curve shares, NOT SPL) — invested 10 COOK
#   exit value 9.801 COOK (exact quoteSell) · PnL −1.99% · ▶ launchpad_sell
#   creator fees 0.035 COOK unclaimed (creator_fee_vault PDA)
# Pools CREATED: 2 × TEST with unclaimed creator fee vaults
```

Cost per scan: 1 HTTP call + `2 + ceil(pools/100)` RPC round-trips (~1.4s for 12 pools).

## Requirement mapping (Phase 1 · H0–H10)

| Hour | Requirement | Where | Proof |
|------|-------------|-------|-------|
| H0–1 | Next.js 14 + TS + Tailwind + Zustand + TanStack Query scaffold, ESLint/Prettier, CI | root config files, `.github/workflows/ci.yml` | `npm run build` green |
| H0–1 | README with requirement mapping | this file | — |
| H1–3 | Port curve math from cookie-mcp (MIT) | `core/curve.ts` (attribution header) | `core/curve.test.ts` golden on-chain vectors |
| H1–3 | Position PDA derivation + account layout decode | `core/decode.ts` | `core/decode.test.ts` golden PDA + base64 account |
| H1–3 | Fee math (trade fee, splits) | `core/fees.ts` | `core/fees.test.ts` |
| H1–3 | Pool phase derivation (live/ended/graduated/expired + expiryMode) | `core/phases.ts` | `core/phases.test.ts` |
| H1–3 | Position actions (sell / claim graduated / refund / winner) | `core/positions.ts` | `core/positions.test.ts` |
| H1–3 | Full 6xxx error-code table (translated; IDL is WRONG for 6019+) | `core/errors6xxx.ts` | `core/errors6xxx.test.ts` |
| H3–5 | MomoSwap API client: /config, /pools (pagination walk + stuck-cursor guard), /pools/:p, /token/:mint | `clients/momoswap.ts` | `clients/momoswap.test.ts` (mock fetch) |
| H3–5 | CookieScan REST + DAS JSON-RPC client | `clients/cookiescan.ts` | live-recorded `__fixtures__/` |
| H3–5 | Typed wrappers, envelope unwrap, timeout+retry | `clients/http.ts`, `core/types.ts` | typecheck + fixtures |
| H3–5 | Fixtures recorded from live API | `__fixtures__/` | `npm run fixtures` |
| H5–7 | Indexer Stages 1–5 (discovery → program resolution → PDA derivation → batched read → valuation) | `core/pipeline.ts` | CLI output above |
| H5–7 | Program-id runtime resolution from `pool.owner` + cache (redeployed-program trap) | `core/decode.ts` `fetchPoolPrograms` | CLI shows per-pool program ids |
| H5–7 | `getMultipleAccountsInfo` chunking (≤100) | `core/decode.ts` `chunk` | decode tests |
| H5–7 | CLI prints true positions for a real mainnet wallet | `scripts/positions.ts` | exit gate ✅ |
| H7–8 | RPC connection manager + genesis check | `clients/rpc.ts` | `useWalletGuard` |
| H7–8 | Polling scheduler: jitter, visibility gating, in-flight dedupe, backoff | `clients/scheduler.ts` | used by header ping |
| H7–8 | WS clients: DAS /stream (heartbeat + backoff), logsSubscribe (JSON-RPC over WS) | `clients/ws.ts` | polling shadow = scheduler |
| H8–10 | Genesis-hash wallet guard (wrong-network interception) | `hooks/useWalletGuard.ts` | header chip + banner |
| H8–10 | Wallet-adapter wiring, Nightly first | `app/wallet-provider.tsx` | connect flow |
| H8–10 | Header: RPC ping + COOK ticker + network chip | `components/Header.tsx`, `hooks/useRpcPing.ts` | live UI |

**Exit gate:** `npm run test` green (84 tests incl. golden curve vectors) **and** the CLI prints a
real wallet's true positions from mainnet — both verified 2026-09-19 against
`rpc.cookiescan.io` / `api.momoswap.fun`.

## Architecture

```
core/          pure, isomorphic engine (no I/O except pipeline's injected deps)
  curve.ts       constant-product math, BigInt, program-exact rounding (ceilDiv → pool's favor)
  decode.ts      PDAs (user-position, creator-fee-vault), account layouts, program resolution
  fees.ts        trade-fee + split math (pool snapshot > /config > default)
  phases.ts      poolPhase (status+timestamps → live/ended/graduated/expired), assertTradeable
  positions.ts   positionAction, buildPositionView (exact quoteSell exit value), totals
  errors6xxx.ts  launchpad error table + Anchor-log error parsing (never trust the IDL: 6019≠slippage)
  pipeline.ts    Stages 1–5 wallet scan — same code path in CLI, API route and browser
clients/       I/O boundary — every network call lives here
  http.ts        fetchJson: timeout, retry, envelope unwrap
  momoswap.ts    launchpad REST (pagination walk w/ nextPoolOffset stuck-cursor guard)
  cookiescan.ts  CookieScan REST + Metaplex DAS JSON-RPC
  rpc.ts         Connection cache, latency ping, genesis-hash guard
  scheduler.ts   jittered visibility-gated polling with per-task backoff
  ws.ts          DAS /stream + logsSubscribe, heartbeat supervision, exp-backoff reconnect
scripts/       positions.ts (CLI), record-fixtures.ts (live → __fixtures__/)
app/           Next.js 14 App Router: landing terminal, /api/{pools,scan,ticker}
hooks/         useWalletGuard (genesis), useRpcPing (header)
```

Design rules (from the master blueprint):

- **Never hardcode economics.** Fees, reserves, targets are admin-tunable and snapshotted per
  pool — resolve `pool.tradeFeeBps ?? config.tradeFeeBps ?? 100`.
- **Never hardcode the program id.** The launchpad was redeployed once; old pools are stranded on
  the old program forever. Resolve from `pool.owner` at runtime (cached per process).
- **WS is never the source of truth.** Every subscription has a polling shadow; balances come
  from RPC reads, not pushed events.
- **A wrong-network read is worse than no read.** The genesis hash
  (`9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2`) is verified before any wallet action.

## Key addresses

| Thing | Value |
|-------|-------|
| RPC / WSS | `https://rpc.cookiescan.io` / `https://wss.cookiescan.io` |
| DAS API / stream | `https://api.cookiescan.io` / `wss://api.cookiescan.io/stream` |
| MomoSwap launchpad API | `https://api.momoswap.fun/v1/launchpad` |
| Genesis hash | `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2` |
| Launchpad program (fallback only) | `momoL7wu4TrXjnXMLCLzGsbx8Pm7XGgoYo7FVqDoqcw` |
| UserPosition PDA | seeds `["user", pool, owner]`, discriminator `[251,248,209,245,83,234,17,27]` |

## Attribution

Curve math, position layouts and the 6xxx error table are ported from
[cookiechain/cookie-mcp](https://github.com/cookiechain/cookie-mcp) (MIT), v0.5.0 — see file
headers in `core/`. Golden test vectors are real on-chain fills from the MomoSwap rehearsal
pools and must not be "updated" without new on-chain evidence.

## Roadmap

- **Phase 1 — Core engine & RPC indexer** ✅
- **Phase 2 — Terminal interface & wallet integration** ✅
- **Phase 3 — Transaction handler & relayer layer** ✅ (this release)
- **Phase 4 — Hardening, polish & demo assets**

### Phase 3 deliverables (H22–H36)

| Hour | Deliverable | Where | Status |
|------|-------------|-------|--------|
| H22–24 | Direct-build path: `/tx/*` fetch → deserialize → sanitize → manifest-verify → blockhash → [wrap ribbon] → Nightly sign → send → confirm → reconcile; 6-stage toasts | `clients/momoswap.ts` (tx builders), `core/tx.ts`, `lib/txflow.ts`, `components/Toaster.tsx` | ✅ pipeline proven by `scripts/e2e-tx.ts` on live mainnet (below) |
| H24–26 | Guard rails: min/cap/phase pre-checks (API does NOT phase-check — we refuse 6011 client-side), re-quote on curve-moved, 6xxx translation, blockhash Rebuild action, wCOOK wrap detection | `lib/txflow.ts` `preflightTradeError`, `translateError` | ✅ chaos test: ended-pool buy → clean 6011 UX |
| H26–28 | cookie-mcp external signer behind `MCP_ENABLED` | `app/api/mcp/route.ts` | ⏸ flag off by design: cookie-mcp needs Node ≥22, deployment targets 20 — the plan's cut-line for "library friction" |
| H28–31 | Gasless relayer: `/api/relay` prepare (eligibility engine, value-out denial, ATA-payer rewrite, spend memo, feePayer pre-sign rewrite) + `/api/relay/submit` (re-assess, co-sign, broadcast); Turnstile w/ explicit dev-bypass; 10/wallet·30/IP per hour; balance alarm | `core/relay/eligibility.ts` (+8 tests), `app/api/relay/**`, `lib/relay-server.ts` | ✅ engine unit-tested; live verdict RELAYABLE on a real claim; 503-honest until `RELAYER_SECRET` funded |
| H31–33 | Starter Drip: 0.05 COOK, 1×/wallet via on-chain memo-ledger scan, drawer empty-gas card | `app/api/drip/route.ts`, `PositionsDrawer.tsx` | ✅ same funding gate |
| H33–35 | Graduation radar: 5s phase-transition watcher, violet card pulse, bell + events, violet toasts; disclosed referral on buys (`NEXT_PUBLIC_COOKIE_REFERRER`) | `store/radar.ts`, `hooks/useRadar.ts`, `Header.tsx` | ✅ live |
| H35–36 | Claim-all sweeper: sequential sponsored claims, single ribbon toast, per-item stages | `lib/txflow.ts` `sweepClaims`, drawer footer | ✅ live |

**New drain-guard (stronger than the plan):** the launchpad API returns an `expectation`
manifest with a **sha256 hash of every instruction's data**. `verifyExpectation` re-hashes the
decoded transaction and refuses to sign on ANY deviation — a compromised or MITM'd API cannot
mutate amounts or smuggle instructions. Plus: program allowlist, feePayer manifest equality,
and relay value-out denial.

**Cookie Chain gotcha found:** `blockHeight ≠ slot` (skipped slots) — blockhash expiry must be
checked against `getBlockHeight`, not `getSlot`. The first harness run "failed" on this and the
guard was right to be suspicious; the metric was wrong.

**E2E harness output (live mainnet, 2026-09-19, zero funds):**

```
A · build buy on TEST — 6 ix · manifest verified byte-for-byte · feePayer matches · internal wrap detected · blockhash +142
B · sponsored sim (sigVerify:false) — SUCCESS units=106717
C · scan → CINU [graduated] claim — manifest verified · sim SUCCESS units=43028 · relay: RELAYABLE
D · chaos: ended pool → preflight refused [launchpad 6011]
E · /api/relay → 503 "relayer hot wallet unconfigured" (honest posture)
```

### Phase 3 runbook — landing the first real transactions

The pipeline is complete and simulation-proven; **mainnet landings need COOK and no faucet
exists** (the chain's #1 pain — which is exactly why the drip + relayer exist).

1. **Buy/sell from the live URL:** connect a funded Nightly wallet → pick a live pool → the
   execution panel signs via the 6-stage flow. Referral disclosure shown when configured.
2. **Sponsored claims + drip:** `cp .env.example .env.local`, set `RELAYER_SECRET` (base58
   secret), fund that wallet with ≥0.2 COOK (1 COOK ≈ 2M sponsored txs), redeploy. Claims then
   cost the user 0 COOK; brand-new wallets self-serve 0.05 COOK from the drawer.
3. **Verify any time:** `npx tsx scripts/e2e-tx.ts` (no funds needed).

### Phase 2 deliverables (H10–H22)

| Hour | Deliverable | Where | Gate |
|------|-------------|-------|------|
| H10–13 | Left feed: cards (progress, phase/mode badges, countdown, anti-snipe/min/max flags), search/sort/filter, 5s refresh, skeletons + empty states | `components/PoolFeed.tsx` | matches momoswap.fun lobby (same API, 5s cadence), real IPFS artwork via `/api/meta` |
| H13–16 | Center: DPR-aware curve canvas (hyperbola, sold-region fill, graduation marker, pulsing spot, **entry pins** for connected holder, hover crosshair) + Lightweight-Charts log-scale price series seeded with **real fill history** (`/api/trades`) + live curve ticks (ring buffer 720) + stat strip + safety row (mint authority / transfer hooks / impostor mints / registry) | `components/CurveCanvas.tsx`, `PriceChart.tsx`, `StatsStrip.tsx`, `SafetyRow.tsx`, `app/api/{trades,safety}/route.ts` | chart renders live pool; pins appear for connected holder |
| H16–19 | True Positions drawer: merged `PositionView` table, totals footer, `positionAction` CTAs (disabled until Phase 3), Claims + Creator tabs, native COOK/wCOOK balances, 30s + focus reconciliation | `components/PositionsDrawer.tsx`, `app/api/balance/route.ts` | funded test wallet shows positions; refresh reconciles |
| H19–21 | Execution panel UI: buy/sell tabs, presets, program-exact quote box (<1ms local BigInt math), tolerance slider, impact-guard visual with 3%/10% zones | `components/ExecutionPanel.tsx`, `lib/quote.ts` | `lib/quote.test.ts` proves quote box ≡ `estimateBuy`/`estimateSell` raw-for-raw |
| H21–22 | On-ramp panel: Jupiter deep link (sCOOK mint), Hyperlane bridge + live reachability probe, Nightly RPC setup card w/ copy buttons; mobile 4-tab layout | `components/OnRampPanel.tsx`, `app/api/bridge-status/route.ts`, `app/page.tsx` | usable at 375px |

**Design system — "Honey Terminal"** (per the uploaded design-engineering skills): warm espresso
surfaces (#0d0a07) with honey-amber signal (#f5a524), cream type, jade/coral P&L semantics;
Space Grotesk + IBM Plex Mono (tabular nums); atmosphere via local gradients/grid/noise (no
network); custom easing (`cubic-bezier(0.23,1,0.32,1)`, drawer `0.32,0.72,0,1`), all UI motion
≤340ms and GPU-only (transform/opacity), `scale(0.97)` press states, staggered first paint,
shimmer skeletons, gated hover (`@media (hover:hover)`), full `prefers-reduced-motion` support.
Generated assets: `app/icon.png` (cookie + EKG mark), `app/opengraph-image.png`, `public/logo.png`.

**Wallets:** Nightly (required, first) · Phantom · Solflare · Backpack + wallet-standard discovery.
