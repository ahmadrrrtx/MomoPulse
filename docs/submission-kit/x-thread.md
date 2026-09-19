# X thread — post from the team account, tag @TheCookieChain (H46–47)

Hook is mandated by the brief. Paste-ready; replace <links>.

---

**1/9**
Your MomoSwap positions are invisible to every wallet.

Not hidden — *invisible*. Pre-graduation buys mint curve shares in a per-pool PDA that no wallet, explorer or portfolio tracker renders. Settled pools sit on unclaimed refunds, tokens and prizes.

We built the terminal that sees them: MomoPulse 🍪
<live-url> · thread 🧵

**2/9**
What MomoPulse sees that nothing else does:

· curve shares + exact exit value (program math, not spot×shares)
· graduated pools owing you SPL tokens
· expired fair pools owing refunds · jackpot/survivor prizes
· creator fee vaults + vesting schedules
· all of it per-wallet, per-pool, in ~1.4s

**3/9**
The terminal: live pool feed (5s), bonding-curve canvas with YOUR entry pins, log-scale fill history from real trades, stat strip, and an execution panel quoting in <1ms with BigInt curve math + impact guard.

Dark patisserie aesthetic. Honey amber on espresso. 375px-ready.

**4/9**
Safety layer, because Cookie Chain deserves one:

· genesis-hash verification — wrong network? blocked, loudly
· mint authority renounced? transfer hooks? impostor symbols? — checked per pool
· every server-built tx re-hashed against the API's sha256 manifest before signing
· value-out denial in the relayer: sponsorship pays fees, never moves your funds

**5/9**
Gas is the #1 pain on Cookie Chain. There is no faucet.

So: a gasless relayer (claims land at 0 COOK — feePayer co-signing, abuse-controlled) + a Starter Drip: 0.05 COOK to any new wallet, once, enforced by an on-chain memo ledger.

0 → trade-capable in <3 min.

**6/9 — THE BRIDGE GUIDE (required)**
Solana → Cookie Chain in 3 steps:

1️⃣ Buy sCOOK on Jupiter (Solana): jup.ag/swap/SOL-36ZrtQoab5MhhySaP1YSTwUahSk6GRVUTtZ6cuVfm9e1
2️⃣ Bridge sCOOK → COOK 1:1 at hyperlane.cookiescan.io (Token-2022 ↔ native, seconds)
3️⃣ Nightly wallet → Networks → add RPC https://rpc.cookiescan.io · explorer cookiescan.io

That's it. You're on Cookie Chain. MomoPulse verifies the genesis hash for you.

**7/9**
Built in public on the stuff Cookie Chain shipped: MomoSwap launchpad API, CookieScan DAS + registry, 0.4s blocks. Curve math ported (MIT) from @cookiechain's cookie-mcp, golden vectors included — 111 tests, mainnet-verified builds.

**8/9**
Try it with any wallet — even empty ones:

· paste an address → see its true positions
· connect Nightly with 0 COOK → drip → gasless claim
· watch the graduation radar ping violet when a pool crosses 100%

<live-url>

**9/9**
MomoPulse — the launchpad terminal for Cookie Chain.
Superteam Earn: <submission-url> · Code: <github-url> · Registry PR: <pr-url>

Built for the @TheCookieChain hackathon. GM, and go claim what's yours. 🍪

---

*After posting: pin it, then share the thread link to Telegram (see telegram-post.md).*
