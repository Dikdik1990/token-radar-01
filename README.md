# Token Radar — make.fun bounty `token-radar-01` (radar-2)

A program + dashboard that ranks the 40 pre-token protocols on make.fun's
watchlist (plus 138 pre-token protocols below the $50M floor it finds itself)
by what their token launch would be worth, and shows how to farm each one.

## Model (radar-2, `lib/model.ts`)

```
implied = round( tvl_usd
                 x peer_multiple(category)
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4)
                 x min(1.12, 1 + 0.04 x ln(chains)) )
```

`peer_multiple` is the median market-cap/TVL of live-token protocols in the
same category, shrunk toward the global median with weight `n/(n+4)` and
clamped to [0.03, 1.0], fitted from the snapshot itself. The starter's flat
0.25x ranked almost exactly by TVL (Spearman 0.981); the peer multiple breaks
that sort (Spearman 0.844 on this snapshot) while staying a stated function of
the snapshot's figures — no protocol name is special-cased.

- `value_score` 0–100: log10 implied value rescaled across the board.
- `launch_odds`: logistic in value_score, clamped to 5–95% (a relative signal,
  not a launch forecast).
- `expected_value_usd = round(odds × implied)`.
- `predicted_mcap_usd = implied`, with a 0.35x–1.9x band.
- Farm economics: `total_cost = gas + active_hours × $20/h` exactly;
  `expected_airdrop = odds × min($2,500, 0.01% of predicted mcap)`;
  `net` and `roi` follow. Negative nets are shown as negative.

Calibration note (honest): on a 50/50 held-out split of live-token protocols
the shrunk peer multiple did not beat a flat 0.25x at predicting market cap
(logMAE 1.91 vs 1.83), so it is used as a category prior for differentiation,
not as a point forecast. See `VALIDATION.md`.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
node check.mjs out ../input/snapshot.json   # gate + model checks
```

Requires Node.js 22.18+. No install, no network, stdlib only, deterministic
(two runs write byte-identical output).

## Layout

- `main.ts` — reads `/input/snapshot.json`, writes `board.json`, `data.js`,
  copies `dashboard/` + `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — the radar-2 model, farm plans, board builder.
- `vendor/makefun-board.ts` — make.fun's dossier library, unmodified from the kit.
- `dashboard/` — static page (index.html, app.css, app.js; 31,728 bytes total,
  no network): sortable/filterable board (search, category, chain, verdict),
  detail view per protocol, live-token view.
- `screenshots/` — 3 real captures of the dashboard (board, detail, filtered).
- `check.mjs` — the validation script; `VALIDATION.md` — its results.

## Status

Local build only. **Not submitted**: no GitHub repo, no transcripts bundle,
no Solana wallet, no login. See `VALIDATION.md` for what is still missing.
