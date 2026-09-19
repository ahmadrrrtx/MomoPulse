# Registry PR runbook — `cookiechain/superteam-hackathon-submissions` (H45–46)

Everything is pre-built in this repo; the PR is 4 mechanical steps (~6 minutes).

## Preflight (assets already generated)

- `assets/logo-512.png` — 512² registry logo ✅
- `assets/banner-1500x500.png` — banner ✅
- `docs/submission-kit/registry-entry.json` — apps.json entry, schema-matched to the existing 12 entries ✅
- Screenshots: capture 3 from the live URL (60 seconds, devtools device toolbar for #3):
  1. desktop terminal (feed + curve + execution panel) → `assets/screenshots/01-terminal.png`
  2. drawer open on Claims tab with a funded wallet → `assets/screenshots/02-drawer-claims.png`
  3. 375px mobile, chart tab → `assets/screenshots/03-mobile.png`
- Demo video: record `docs/demo-script.md` once (OBS/QuickTime, 90s) → `docs/demo.mp4` +
  `convert`/ffmpeg GIF ≤8MB → `docs/demo.gif`

## Steps

```bash
git clone https://github.com/<your-github>/superteam-hackathon-submissions.git fork && cd fork
git remote add upstream https://github.com/cookiechain/superteam-hackathon-submissions.git
git fetch upstream && git checkout -b add-momopulse upstream/main

# 1 · entry
python3 - << 'PY'
import json
apps = json.load(open('apps.json'))
entry = json.load(open('<momopulse>/docs/submission-kit/registry-entry.json'))
apps.append(entry)
json.dump(apps, open('apps.json','w'), indent=2)
PY

# 2 · media
mkdir -p logos banners
cp <momopulse>/assets/logo-512.png logos/momopulse.png
cp <momopulse>/assets/banner-1500x500.png banners/momopulse.png
#    then set media.logo/banner in the entry to the raw.githubusercontent URLs of THIS repo:
#    https://raw.githubusercontent.com/cookiechain/superteam-hackathon-submissions/main/logos/momopulse.png  (post-merge)
#    (pre-merge, point at your fork's raw URLs — maintainers routinely accept either)

# 3 · commit + push + PR
git add apps.json logos banners && git commit -m "Add MomoPulse — launchpad terminal for Cookie Chain"
git push origin add-momopulse
gh pr create --repo cookiechain/superteam-hackathon-submissions \
  --title "Add MomoPulse — the launchpad terminal that sees invisible curve positions" \
  --body-file <momopulse>/docs/submission-kit/pr-body.md
```

## PR body (save as pr-body.md)

> **MomoPulse** — launchpad terminal & bonding-curve position manager for Cookie Chain.
> Superteam Earn entry: <submission-url> · X thread: <thread-url> · Live: <vercel-url>
>
> - Sees pre-graduation curve shares no wallet/explorer shows (UserPosition PDA derivation)
> - Program-exact exit values (BigInt quoteSell), claims/refunds/winner payouts + sweep-all
> - Gasless relayer (0-COOK claims) + starter drip; genesis-hash wrong-network guard
> - Safety layer: mint authority, Token-2022 hooks, impostor mints
>
> Adds apps.json entry + logo + banner per schema. Demo video in the Earn submission.
