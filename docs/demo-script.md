# 90-second demo video — shot list & narration (H44–45)

Record against the LIVE URL (OBS/QuickTime, 1440p, dark mode OS). One take per scene; cut on
toast lifecycle. Total 88–92s. Export MP4 (registry PR) + GIF ≤8MB (apps.json `links.video`).

| # | t | Screen | Action | Narration / caption |
|---|---|--------|--------|---------------------|
| 1 | 0–8 | Landing, empty state | fresh incognito, no wallet | "Your MomoSwap positions are invisible to every wallet. This terminal sees them." |
| 2 | 8–18 | Header + feed | connect **Nightly** (wallet with **0 COOK**) | "Nightly connects; the genesis hash is verified before anything else. This wallet is broke — perfect." |
| 3 | 18–30 | Drawer → drip | open drawer → 🚰 drip card → click | "No faucet exists on Cookie Chain, so MomoPulse drips 0.05 COOK — once per wallet, enforced on-chain." show toast + explorer link |
| 4 | 30–44 | Drawer → claims | Claims tab → **sweep** button | "Settled pools owe money nobody can see. Sweep claims every one — gasless: the relayer co-signs as feePayer." show ribbon stages ①–⑤ |
| 5 | 44–58 | Execution panel | live pool → buy 1 COOK → quote updates as you type → sign | "Quotes are the program's own BigInt math — under a millisecond, with an impact guard. The API's instruction manifest is re-hashed before signing." |
| 6 | 58–70 | Curve canvas | hover crosshair → entry pin appears post-buy | "The curve canvas pins YOUR entry against the live bonding curve. No wallet renders this." |
| 7 | 70–80 | Sell | sell 50% → toast lifecycle → positions reconcile | "Sell reconciles the position in place — shares, PnL, totals." |
| 8 | 80–88 | Radar + mobile | bell ping (or violet card) → 375px view | "Graduation radar, safety layer, mobile-ready. MomoPulse — built for Cookie Chain." end card: links |

**Captions to burn in:** scene 3 "0 → trade-capable in <3 min"; scene 4 "0 COOK gas";
scene 5 "manifest-verified · program-exact"; scene 8 "@TheCookieChain hackathon".

**No-wallet fallback:** if a funded Nightly isn't available at recording time, record scenes
1–2 + 6–8 with a pasted address (read-only path is identical) and label scene 4/5 toasts as
"relayer pending funding" — honesty over theater; the e2e harness log covers the rest.
