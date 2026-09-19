# Deploy MomoPulse (3 minutes, free)

The app needs a server: `api.momoswap.fun` and `rpc.cookiesan.io` send **no CORS headers**, so
the browser can't call them directly — the Next.js API routes are the proxy (and the relayer).
That rules out static hosts (GitHub Pages / Netlify-static). **Vercel is the target** and
`vercel.json` is already configured.

## Option A — one-click Vercel import (recommended)

1. Open: **https://vercel.com/new/clone?repository-url=https://github.com/ahmadrrrtx/MomoPulse**
2. Sign in with GitHub → it finds `ahmadrrrtx/MomoPulse` → click **Deploy** (no settings to
   change; framework = Next.js is auto-detected, `vercel.json` sets function memory/timeout).
3. Wait ~90s → you get `https://momopulse-*.vercel.app`.
4. (Optional) Project → Settings → Domains: rename to `momopulse.vercel.app` if free.
5. Copy the URL into: README top block, `docs/submission-kit/*` placeholders, Earn submission.

## Option B — Vercel CLI (if you prefer terminal)

```bash
npm i -g vercel && vercel login
cd momopulse && vercel link && vercel deploy --prod
```

## Environment variables (all optional — app works without any)

Project → Settings → Environment Variables, then redeploy:

| Var | When to set |
|---|---|
| `RELAYER_SECRET` | to activate gasless claims + 0.05 COOK drip (base58 keypair; fund ≥0.2 COOK). Unset ⇒ honest 503, direct path still works |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | production bot-check on relay/drip. Unset ⇒ explicit dev-bypass, rate limits still on |
| `NEXT_PUBLIC_COOKIE_REFERRER` | your referral wallet — disclosed in-UI on buys (20% of the 1% fee) |
| `MCP_ENABLED` | leave `false` (cookie-mcp needs Node ≥22; Vercel runs 20) |

## Post-deploy smoke test (2 min)

```
GET  /                → 200, feed renders with live pools (5s refresh)
GET  /api/pools       → JSON array, ≥1 pool
GET  /api/scan?wallet=AgaiwCd1tVmRoZeRrB4ZzPcf1oUnh4Q1FaykrfVGc5ou  → true positions
GET  /api/relay       → 503 {"reason":"relayer hot wallet unconfigured"} (until RELAYER_SECRET set)
```

Then connect Nightly → wrong-network banner if not on Cookie Chain → add RPC
`https://rpc.cookiesan.io` → drawer opens → copilot tab answers "what do I hold?".

## CI

`.github/workflows/ci.yml` runs typecheck + 111 tests + build on every push to `main` —
Vercel also builds independently; keep both green before submitting to Earn.
