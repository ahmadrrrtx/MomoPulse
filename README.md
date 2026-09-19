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

- **Phase 1 — Core engine & RPC indexer** ✅ (this)
- **Phase 2 — Terminal interface & wallet integration** (pool feed/chart/execution grid, portfolio drawer, shadcn)
- **Phase 3 — Transaction handler & gasless relayer** (buy/sell/claim tx build, feePayer sponsorship, Starter Drip)
- **Phase 4 — Hardening, polish & demo assets**
