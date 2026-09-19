# 🍪 MomoPulse

**Launchpad terminal & bonding-curve position manager for Cookie Chain (SVM).**

MomoSwap Launchpad buys mint *curve shares* tracked in a per-pool `UserPosition` PDA — invisible
to every wallet, explorer and portfolio tracker. Settled pools hide real money: graduated pools
owe SPL-token claims, expired *fair* pools owe refunds, jackpot/survivor pools owe winner
payouts, creators sit on unclaimed fee vaults and vesting. MomoPulse derives every PDA, decodes
it with genesis-verified layouts, values it with the program-exact `quoteSell` math, and tells
you the one action each position needs.

> Built for the Cookie Chain hackathon (Superteam). All 4 phases shipped — core engine,
> Honey Terminal UI, transaction handler + gasless relayer, hardening + read-only copilot.

**Demo:** live URL `<vercel-url>` · 90s video `docs/demo.mp4` (script: `docs/demo-script.md`) ·
X thread `<thread-url>` · registry entry `docs/submission-kit/`

---

## Quick start

```bash
npm install
npm run test          # 111 unit tests: golden curve vectors, PDA decoders, fees, phases, relay, copilot
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

## Security model

Non-custodial by construction — the server never holds a user key and never moves user funds.

| Layer | Mechanism | Where |
|-------|-----------|-------|
| Network guard | Genesis hash (`9wDaBRDg…cBB2`) verified before any wallet action; mismatch → banner + all CTAs blocked | `clients/rpc.ts`, `hooks/useWalletGuard.ts` |
| Drain guard | Launchpad API returns a sha256 **manifest of every instruction's data**; we re-hash the decoded tx and refuse to sign on ANY deviation (mutated amounts / smuggled ix). Program allowlist + feePayer equality on top | `core/tx.ts` `verifyExpectation` |
| Freshness guard | Cookie Chain gotcha: `blockHeight ≠ slot` — blockhash expiry checked against `getBlockHeight`, with a Rebuild toast action; curve-moved re-quote gate before signing | `lib/txflow.ts` |
| Preflight | Client-side 6011/phase/min/cap checks (the API does NOT phase-check) + full 6xxx translation with recovery actions | `lib/txflow.ts`, `core/errors6xxx.ts` |
| Relayer | Claim-only eligibility engine (allowlist by `positionAction`), **value-out denial** (sponsored txs may never transfer value from the claimant), deny claimant-source transfers, ATA-payer rewrite, spend memo `MOMOPULSE_RELAY:v1:<wallet>:<epochHour>`, 10/wallet·h + 30/IP·h, Turnstile (dev-bypass explicit), hot wallet from `RELAYER_SECRET` → unconfigured ⇒ honest 503 | `core/relay/eligibility.ts`, `app/api/relay/**` |
| Drip | 0.05 COOK once/wallet, deduped by on-chain memo ledger `MOMOPULSE_DRIP:v1:<wallet>` (not a mutable DB) | `app/api/drip/route.ts` |
| Token safety | Mint authority / freeze checks, **Token-2022 transfer-hook TLV scan** (type-14), impostor-symbol flags from the CookieScan registry | `app/api/safety/route.ts`, `core/relay/eligibility.ts` `scanTransferHook` |
| Disclosure | Referral (`NEXT_PUBLIC_COOKIE_REFERRER`, 20% of the 1% trade fee) shown in-UI on every buy it applies to | `components/ExecutionPanel.tsx` |

Every failure path in the matrix was **executed**, not designed on paper — see
`docs/error-states/README.md` + `matrix.log` (10/10 rows).

## Mainnet evidence

Real reads, builds and fills from live Cookie Chain mainnet (2026-09-19), zero-funds honest:

| Evidence | Value |
|----------|-------|
| Live trade decoded by our pipeline (buy, 1 COOK → 2,950.741885 shares) | sig `mygpsor5UYqQa1hopV6dJvjCBDNtcSEsMMuuWrym3voMDVXY7JAT3SQvuqFNsbY2LTjDssi9mVosRGkSUeSoXS1` — [cookiesan.io/tx/…](https://cookiesan.io/tx/mygpsor5UYqQa1hopV6dJvjCBDNtcSEsMMuuWrym3voMDVXY7JAT3SQvuqFNsbY2LTjDssi9mVosRGkSUeSoXS1) |
| Live round-trip sell (0.989999277 COOK out — fee math matches `quoteSell` to the unit) | sig `PjmAQ7uZfY5CSs5DwavAztzcbW6qJPJitWpsjRZDbsRoF1pNo3chaBXz19RyPpZTqQwYrswr9znpTBR2xs847DL` |
| Manifest-verified buy build + sponsored simulation | TEST pool, 6 ix, byte-for-byte sha256 match, sim SUCCESS **106,717 CU** (`scripts/e2e-tx.ts`) |
| Manifest-verified claim build + simulation + relay verdict | CINU graduated pool, sim SUCCESS **43,028 CU**, eligibility **RELAYABLE** |
| True-positions scan of a real wallet | `AgaiwCd1…` — 29,506.688566 curve shares, exact exit value 9.801 COOK, 0.035 COOK creator fees (CLI output above) |
| Golden curve vectors | real on-chain fills (fee 10,000,000 / net 990,000,000 / tokens 6,019,482,185 for 1 COOK) pinned in `core/curve.test.ts` |

Landings from this repo require COOK and **no faucet exists** (the chain's #1 community pain) —
which is exactly why the gasless relayer + drip ship in this build. Verification path until
funded: `npx tsx scripts/e2e-tx.ts` (simulate + manifest-verify against live state, no funds).

## Environment

`cp .env.example .env.local` — all optional; absent ⇒ documented degraded mode, never a crash:

| Var | Purpose | Absent behavior |
|-----|---------|-----------------|
| `RELAYER_SECRET` | base58 key of relayer/drip hot wallet (1 COOK ≈ 2M sponsored txs) | `/api/relay`, `/api/drip` → 503 with reason; claims fall back to direct path |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | humanity check on relay + drip | explicit dev-bypass (`dev:true` in responses); rate limits still enforced |
| `NEXT_PUBLIC_COOKIE_REFERRER` | disclosed referral on buys (20% of the 1% trade fee) | no referral attached, no disclosure shown |
| `MCP_ENABLED` | cookie-mcp external-signer path (needs Node ≥22) | off — direct-build only; `/api/mcp` → 501 |

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
pools and must not be "updated" without new on-chain evidence. The copilot, relayer, drill
harness and all UI are original work; `assets/` imagery is generated. The committed launchpad
IDL mislabels errors 6019+ (SlippageEx shifted) — the source enum in cookie-mcp wins, and our
`core/errors6xxx.ts` follows the source, not the IDL.

## Roadmap

- **Phase 1 — Core engine & RPC indexer** ✅
- **Phase 2 — Terminal interface & wallet integration** ✅
- **Phase 3 — Transaction handler & relayer layer** ✅
- **Phase 4 — Hardening, polish & demo assets** ✅ (this release)

### Phase 4 deliverables (H36–H48)

| Hour | Deliverable | Where | Status |
|------|-------------|-------|--------|
| H36–38 | Latency pass: lightweight-charts dynamic-imported (route First Load **256→219 kB**), chart skeleton, selector audit, system-font stack + subset local faces | `components/PriceChart.tsx`, `app/globals.css` | ✅ build budget table below |
| H38–40 | Failure-recovery drills on mainnet: all 10 matrix rows **executed** (wrong network, 0 gas, expired blockhash, rejected sig, API 500, WS drop, hooked mint, confirm timeout, curve moved, impostor) | `scripts/drills.ts` → `docs/error-states/{README.md,matrix.log}` | ✅ 10/10 |
| H40–42 | Stretch **P2-2 read-only copilot** (chosen: zero P0/P1 defects; no-key, deterministic — answers 5 canned intents: holdings, claims, gas, radar, safety) | `lib/copilot.ts` (+tests), 4th drawer tab | ✅ 111/111 tests |
| H42–44 | README as submission front door: architecture, security model, evidence, env, attribution | this file | ✅ |
| H44–46 | Demo kit: 90s shot list + narration, registry assets (logo 512², banner 1500×500) | `docs/demo-script.md`, `assets/` | ✅ assets generated; video recorded on deploy day (no browser in build sandbox) |
| H45–47 | Submission kit: apps.json entry (schema-matched), PR runbook, X thread **with required bridge guide**, Telegram post | `docs/submission-kit/` | ✅ paste-ready; posted from user accounts |
| H47–48 | Superteam Earn submission field values + evidence checklist | `docs/submission-kit/earn-submission.md` | ✅ submit ≥24h early |

**Perf budget (measured, `next build`):** route `/` First Load JS **219 kB** (down from 256 kB;
charting lib moved off the critical path via dynamic import), LCP element = static honey-gradient
hero (no network image), all polls visibility-gated + jittered, WS never source-of-truth.
Lighthouse/mobile run is a deploy-day step (`docs/submission-kit/earn-submission.md` checklist) —
the build sandbox has no browser; the budget table + code-split evidence ship instead.

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
