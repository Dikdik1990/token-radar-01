# Validation — Token Radar radar-2 (token-radar-01)

Validated 2026-11-26 (WIB) by running the entry and `node check.mjs`
(`entry/check.mjs`, 27 checks). All 27 checks pass. No login, no submission,
no GitHub push, no wallet was created.

## How to reproduce

```sh
cd entry
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit-unpacked/token-radar-01-kit/input/snapshot.json
node check.mjs out ../kit-unpacked/token-radar-01-kit/input/snapshot.json
```

Node v24.22.1, stdlib only, no network. Screenshots were taken with the
local Chromium (Chrome 157 headless via CDP) from `out/dashboard/index.html`
— `file://`, because this Chromium build blocks `http://127.0.0.1` navigations
(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`); the page itself makes no
network requests either way.

## Gate results (the sealed gate's seven rows)

| Gate row | Result |
|---|---|
| dashboard_files | PASS — index.html + app.css + app.js, 31,728 bytes total (< 64 KiB, so the judge reads the source whole), no `http://`/`https://` anywhere in dashboard source |
| board_file | PASS — 178 rows, 346,135 bytes (< 8 MiB), every slug in the snapshot, no duplicates |
| sorted_by_value | PASS — ranks exactly 1..178, implied value non-increasing ($1,886,714,127 → $749,907), 178 distinct values |
| coverage | PASS — watchlist 40/40 |
| farm_steps | PASS — 178 rows × 5 steps, every step 20–600 chars |
| screenshots | PASS — 3 PNGs, 1440×900 each, 162,999 / 210,217 / 165,939 bytes (each < 512 KiB); visually verified: board, detail (Steakhouse Financial), filtered (Risk Curators, 33 of 178 rows) |
| dossier_matches | PASS — `out/dossier.json` (751,956 bytes, < 1.5 MiB) is byte-identical to `buildDossier(out, {text_max_bytes: 65536})` rebuilt from `out/` |

## Model consistency gates (the entry's own bar)

| Check | Result |
|---|---|
| Spearman TVL rank vs value_score rank < 0.9 | PASS — 0.8437 (starter radar-1: 0.981, i.e. a TVL sort) |
| Spearman launch_odds vs value_score ≥ 0.3 | PASS — 0.9939 |
| Spearman expected_value vs value_score ≥ 0.3 | PASS — 0.9995 |
| launch_odds mean in (0.05, 0.95) | PASS — 0.2338 |
| value_score ≥ 10 distinct | PASS — 178 distinct |
| launch_odds ≥ 5 distinct | PASS — 173 distinct |
| expected_value ≥ 5 distinct | PASS — 178 distinct |
| median predicted high/low ≥ 1.5 | PASS — 5.43 (0.35x–1.9x band) |
| expected_value = round(odds × implied) | PASS — all 178 rows |
| farm economics consistent | PASS — all 178 rows: total_cost = gas + time × $20/h exactly, net = expected_airdrop − total_cost, roi = net/total_cost, expected_airdrop ≤ 50% of predicted mcap |
| data.js rows match board | PASS — 178 board rows + 24 live-token rows |

## Determinism

Two fresh runs into separate output dirs are byte-identical (`diff -r out1 out2`
clean, and `out` matches them too): board.json, data.js, dashboard/, screenshots/
and dossier.json all reproduce exactly.

## Top 10 board

| # | Protocol | Score | Odds | Implied value | TVL | Verdict |
|---|---|---|---|---|---|---|
| 1 | Steakhouse Financial | 100.0 | 82.1% | $1,886,714,127 | $2,753,981,495 | Top farm |
| 2 | Gauntlet | 93.5 | 80.7% | $1,133,572,048 | $1,577,685,462 | Top farm |
| 3 | Nonce Capital | 73.9 | 69.3% | $245,149,289 | $513,783,671 | Strong farm |
| 4 | Veda | 73.2 | 68.8% | $230,921,637 | $1,563,415,482 | Strong farm |
| 5 | USDD | 70.7 | 66.9% | $190,457,812 | $1,055,793,606 | Strong farm |
| 6 | RockawayX | 69.3 | 65.6% | $171,064,234 | $292,506,628 | Strong farm |
| 7 | Hyperithm | 67.6 | 63.9% | $149,644,486 | $221,638,535 | Strong farm |
| 8 | Hive Protocol | 67.0 | 62.9% | $141,925,406 | $198,776,765 | Strong farm |
| 9 | K3 Capital | 66.5 | 62.5% | $136,466,791 | $207,711,162 | Strong farm |
| 10 | Clearstar | 63.3 | 59.0% | $106,402,415 | $161,773,491 | Strong farm |

Verdicts overall: Top farm 2, Strong farm 9, Farm 17, Watch 37, Low priority 113.
Farm net positive on 132/178 rows at $20/hour; the other 46 show a negative net
honestly instead of promising a profit.

## Calibration (honest)

A 50/50 held-out split of live-token protocols (by slug parity) gives logMAE
1.91 for the shrunk peer multiple vs 1.83 for the flat 0.25x — the peer prior
does **not** beat flat at predicting market cap out of sample (category
multiples are noisy; several categories have 1–3 live peers). It is kept with
strong shrinkage (n/(n+4)) and a [0.03, 1.0] cap because its job is
differentiation, not point prediction, and the dashboard + model header state
this plainly. The peer multiple for Risk Curators (0.7917x) rests on a single
live peer (median 2.97x shrunk 80% toward the global median) — the most fragile
number in the model; it drives ranks 1–3 and should be read as such.

## Notes / corrections vs the brief

- The brief's §2/§3/§4 field names (value_score, launch_odds, expected_value,
  predicted_mcap, farm_plan, evidence_chain) are **not** in the kit's
  RULES.txt / starter `BoardRow` — the sealed gate only requires slug, name,
  rank, implied_value_usd and farm_steps (extra keys allowed). All of them
  were added anyway as extra keys, and they satisfy the brief's consistency
  gates above. The dashboard also surfaces them (score, odds, EV, predicted
  range, farm economics, evidence) so the judge can see them.
- Board is 178 rows, not 200: 40 watchlist + the 138 pre-token protocols
  below the floor that pass the watchlist's own cleanliness rule (no CEX /
  bridge / liquid-staking / restaking, no versioned pools, no wrapped/staked
  names). That is the whole strict set on this snapshot.
- Screenshot tooling: the first attempt with the raw Chromium binary failed
  on the Hatch WebGL domain-policy check; it was solved with a valid
  `--hatch-webgl-allowed-domains-file` + sha256, then the local HTTP server
  was blocked by Chrome's Local Network Access check, so screenshots were
  taken over `file://` via a small CDP driver (`/tmp/shot.mjs`, Node stdlib).
  Screenshots are genuine renders of the built dashboard, verified visually.

## Still missing for submission (not done, needs the user)

1. **GitHub repo** — public repo created *after* the competition opened,
   with this entry committed (repo must be the entrant's; needs Ilham's
   GitHub account). `main.ts` must sit at the repo root with `vendor/`,
   `lib/`, `dashboard/`, `screenshots/`, `LICENSE`.
2. **Agent transcripts** — the transcript bundle of the session(s) that
   built this entry. Not fabricated; the real session transcripts must be
   exported and attached at submit time.
3. **Solana wallet** — a wallet linked to the make.fun account to sign the
   entry and receive USDC if it wins. No wallet was created here.
4. **make.fun account + submit** — sign in, link wallet, submit the repo URL
   + commit + transcripts before **2026-12-14 10:00 UTC** (17:00 WIB).
   Quota: max 5 submissions/day, 10 total.
5. Optional: a final visual pass on the detail dialog (its farm-economics
   section sits below the fold at 1440×900 and needs scrolling).
