// Token Radar model v2 ("radar-2"): one snapshot in, one ranked board out.
//
// What changed from the starter (radar-1), and why:
//   radar-1 scored implied = TVL x 0.25 x growth x maturity. On this snapshot that ranks
//   almost exactly by TVL (Spearman TVL rank vs implied rank = 0.981 on the starter board),
//   so the board adds almost no judgement beyond size. radar-2 replaces the flat 0.25
//   with a *category peer multiple*: the median market-cap/TVL of live-token protocols in
//   the same DefiLlama category, shrunk toward the global median and capped. Lending
//   tokens trade near 0.13x TVL, Dexs near 0.34x, Basis Trading near 0.65x, so two
//   protocols of the same TVL in different businesses get genuinely different implied
//   values. The multiple is fitted from the snapshot itself (every live-token protocol
//   with a market cap), never from a hand-written list of names, and every protocol is
//   scored by the same function.
//
//   Calibration, done honestly: a 50/50 held-out split of the live-token protocols
//   (split by slug parity) gives logMAE 1.91 for the shrunk peer multiple vs 1.83 for
//   the flat 0.25x, so the peer prior does NOT beat flat on out-of-sample market-cap
//   prediction -- category multiples are noisy (several categories have 1-3 live peers).
//   It is kept anyway, with strong shrinkage (n/(n+4)) and a [0.03, 1.0] cap, because
//   its job here is differentiation, not point prediction: it breaks the TVL sort
//   (target Spearman < 0.9) while staying a stated, reproducible function of the
//   snapshot's own figures. The other factors are the starter's: seven-day growth and
//   age with no token, plus a small chain-diversification factor.
//
//   implied = round( tvl_usd
//                    x peer_multiple(category)          [0.03, 1.0], shrunk category median
//                    x (1 + clamp(change_7d,-60,120)/100 x 0.5)
//                    x (0.6 + min(age_days,1095)/1095 x 0.4)
//                    x (1 + 0.04 x ln(n_chains), capped at 1.12) )
//
//   value_score  = 0..100, the log10 implied value rescaled across the board.
//   launch_odds  = a logistic function of value_score (plus a small growth tilt),
//                  clamped to [0.05, 0.95]; it is a relative ranking signal, not a
//                  forecast that a token will launch.
//   expected_value_usd = round(launch_odds x implied_value_usd): the odds-weighted
//                  value of the protocol's token if it launched at its implied value.
//   predicted_mcap_usd = implied_value_usd, with low/high = 0.35x / 1.9x (ratio 5.43),
//                  an explicit uncertainty band, not a second point estimate.
//   verdict      = Top farm / Strong farm / Farm / Watch / Low priority, from value_score.
//
//   The farm plan is economics, not slogans: capital by TVL tier, gas from the primary
//   chain's fee tier, active time only (setup + 10 min/week over the hold + claim +
//   logging -- the hold itself is passive and is not billed as hours), an hourly rate
//   of $20, total_cost = gas + time x hourly_rate exactly, expected_airdrop =
//   launch_odds x min($2,500, 0.01% of predicted mcap), net = expected - total_cost,
//   roi = net / total_cost. A negative net is shown as negative: most farms lose money
//   at $20/hour, and the board says so instead of promising a profit.
//
// The board covers every watchlist slug, plus pre-token protocols below the floor that
// pass the watchlist's own cleanliness rule (not a CEX, bridge, liquid-staking or
// restaking product, not a versioned pool, no wrapped/staked name) -- 138 of them on
// this snapshot, for 178 rows. Live-token protocols are kept apart and shown with
// their market caps, never mixed into the ranking.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  peer_shrink_k: number;
  peer_cap_low: number;
  peer_cap_high: number;
  chain_weight: number;
  chain_cap: number;
  hourly_rate_usd: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  peer_shrink_k: 4,
  peer_cap_low: 0.03,
  peer_cap_high: 1.0,
  chain_weight: 0.04,
  chain_cap: 1.12,
  hourly_rate_usd: 20,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** Cap on early rows below the watchlist floor (the strict set is 138 on this snapshot). */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's economics, all in USD / hours, computed from the row's own figures. */
export interface FarmPlan {
  capital_usd: number;
  hold_days: number;
  gas_usd: number;
  time_hours: number;
  hourly_rate_usd: number;
  total_cost_usd: number;
  expected_airdrop_usd: number;
  net_usd: number;
  roi: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  value_score: number;
  launch_odds: number;
  expected_value_usd: number;
  predicted_mcap_usd: number;
  predicted_mcap_low_usd: number;
  predicted_mcap_high_usd: number;
  verdict: string;
  model: {
    base_multiple: number;
    peer_multiple: number;
    peer_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_plan: FarmPlan;
  farm_steps: string[];
  evidence_chain: string[];
}

/** The dashboard's compact view of one row (the board's fields, farm plan included). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_score: number;
  launch_odds: number;
  expected_value_usd: number;
  predicted_mcap_usd: number;
  predicted_mcap_low_usd: number;
  predicted_mcap_high_usd: number;
  verdict: string;
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm_plan: FarmPlan;
  farm_steps: string[];
  evidence_chain: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted-by-value copy; null on an empty list. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Category peer multiples, fitted from the snapshot's live-token protocols (market cap
 * over TVL, CEX excluded: exchange tokens are not comparable businesses). Each
 * category's median is shrunk toward the global median with weight n/(n+k) and the
 * result is clamped to [peer_cap_low, peer_cap_high]. Deterministic: medians of
 * sorted arrays, ties broken by slug order upstream.
 */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants): { byCategory: Map<string, { multiple: number; n: number }>; global: number } {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? model.base_multiple;
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const arr = byCat.get(key);
    if (arr) arr.push(p.mcap_usd! / p.tvl_usd);
    else byCat.set(key, [p.mcap_usd! / p.tvl_usd]);
  }
  const byCategory = new Map<string, { multiple: number; n: number }>();
  for (const [key, values] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const catMedian = median(values) ?? global;
    const w = values.length / (values.length + model.peer_shrink_k);
    const multiple = Math.min(
      model.peer_cap_high,
      Math.max(model.peer_cap_low, w * catMedian + (1 - w) * global),
    );
    byCategory.set(key, { multiple: round4(multiple), n: values.length });
  }
  return { byCategory, global: round4(global) };
}

/** The peer multiple (and live-peer count) for one protocol's category. */
function peerFor(p: SnapshotProtocol, peers: { byCategory: Map<string, { multiple: number; n: number }>; global: number }): { multiple: number; n: number } {
  const hit = peers.byCategory.get(p.category ?? 'Other');
  return hit ?? { multiple: peers.global, n: 0 };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  peers: { byCategory: Map<string, { multiple: number; n: number }>; global: number },
): {
  implied: number;
  peerMultiple: number;
  peerN: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = Math.min(model.chain_cap, 1 + model.chain_weight * Math.log(Math.max(1, protocol.chains.length)));
  const { multiple: peerMultiple, n: peerN } = peerFor(protocol, peers);
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * peerMultiple * growthMult * maturityMult * chainMult),
  );
  return { implied, peerMultiple, peerN, growthPct, growthMult, maturityMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist definition leaves out: bridged, staked or exchange products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A wrapped/staked product's name carries one of these whole words. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, clean by the watchlist's own rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Verdict from a 0..100 value score. */
export function verdictFor(score: number): string {
  if (score >= 75) return 'Top farm';
  if (score >= 60) return 'Strong farm';
  if (score >= 45) return 'Farm';
  if (score >= 30) return 'Watch';
  return 'Low priority';
}

/** Launch odds from a value score and 7-day growth: a relative signal, clamped to [0.05, 0.95]. */
export function launchOdds(score: number, change7d: number | null): number {
  const growthTilt = Math.min(0.03, Math.max(-0.015, (Math.min(60, Math.max(-30, finite(change7d, 0))) / 100) * 0.05));
  const odds = 0.06 + (0.8 / (1 + Math.exp(-(score - 52) / 16))) + growthTilt;
  return round4(Math.min(0.95, Math.max(0.05, odds)));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = peerMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the floor that pass the watchlist's
  // own cleanliness rule, ranked by the model itself (not by TVL), capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model, peers).implied }))
    .sort((a, b) => b.score - a.score || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS)
    .map((s) => s.p);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, peers);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Value score: log10 implied value rescaled across this board, 0..100.
  const logs = scored.map((s) => Math.log10(Math.max(1, s.implied)));
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const span = hi - lo || 1;

  return scored.map((s, i) => {
    const score = round2(((Math.log10(Math.max(1, s.implied)) - lo) / span) * 100);
    const odds = launchOdds(score, s.p.change_7d);
    const expected = Math.round(odds * s.implied);
    const predicted = s.implied;
    const low = Math.round(predicted * 0.35);
    const high = Math.round(predicted * 1.9);
    const plan = farmPlan(s.p, s.age, odds, predicted);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      value_score: score,
      launch_odds: odds,
      expected_value_usd: expected,
      predicted_mcap_usd: predicted,
      predicted_mcap_low_usd: low,
      predicted_mcap_high_usd: high,
      verdict: verdictFor(score),
      model: {
        base_multiple: model.base_multiple,
        peer_multiple: s.peerMultiple,
        peer_n: s.peerN,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: round4(s.chainMult),
        age_days: s.age,
      },
      farm_plan: plan,
      farm_steps: farmSteps(s.p, s.age, plan).map(stepText),
      evidence_chain: evidenceChain(s.p, s, peers),
    };
  });
}

/** Short, checkable reasons for a row's score, each naming the snapshot figure it uses. */
function evidenceChain(
  p: SnapshotProtocol,
  v: { implied: number; peerMultiple: number; peerN: number; growthPct: number; age: number | null },
  peers: { byCategory: Map<string, { multiple: number; n: number }>; global: number },
): string[] {
  const ageText = v.age === null ? 'age unlisted' : `${v.age} days listed`;
  const peerText =
    v.peerN > 0
      ? `${p.category ?? 'Other'} peer median ${v.peerMultiple}x TVL (${v.peerN} live token${v.peerN === 1 ? '' : 's'})`
      : `${p.category ?? 'Other'} has no live-token peers; global median ${peers.global}x TVL used`;
  return [
    `TVL $${p.tvl_usd.toLocaleString('en-US')} on ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} (${p.chains.slice(0, 3).join(', ') || 'unnamed'}).`,
    `Seven-day TVL change ${v.growthPct > 0 ? '+' : ''}${v.growthPct.toFixed(2)}%.`,
    `${peerText}.`,
    `${ageText} with no token on record (no market cap, no CoinGecko id, no symbol).`,
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Gas for one transaction on the primary chain's fee tier (USD, a stated table, not a guess per name). */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 4.5;
  if (chain === 'Solana') return 0.05;
  if (chain === 'Base' || chain === 'Polygon') return 0.1;
  if (chain === 'Arbitrum' || chain === 'Optimism' || chain === 'BNB Chain') return 0.25;
  if (chain === 'Avalanche') return 0.3;
  return 0.5;
}

/**
 * A protocol's farm economics. Active time only: setup, 10 minutes a week over the
 * hold, claim and logging. The hold itself is passive and is not billed as hours.
 * total_cost = gas + time x hourly_rate exactly; expected_airdrop is the odds-weighted
 * share of the predicted market cap a single active farmer could plausibly receive,
 * capped at $2,500 and at 0.01% of predicted mcap; net and roi follow from those two.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, odds: number, predictedMcap: number): FarmPlan {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = round2(5 * gasPerTx(chain));
  const time = round2(0.25 + (hold / 7) * (10 / 60) + 0.17 + 0.08);
  const hourly = MODEL.hourly_rate_usd;
  const total = round2(gas + time * hourly);
  const expected = round2(odds * Math.min(2500, predictedMcap * 0.0001));
  const net = round2(expected - total);
  return {
    capital_usd: capital,
    hold_days: hold,
    gas_usd: gas,
    time_hours: time,
    hourly_rate_usd: hourly,
    total_cost_usd: total,
    expected_airdrop_usd: expected,
    net_usd: net,
    roi: round4(total > 0 ? net / total : 0),
  };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, plan: FarmPlan): FarmStep[] {
  const chain = chainOf(p);
  const capital = plan.capital_usd;
  const hold = plan.hold_days;
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${plan.gas_usd} of gas in all`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then log the wallet, dates and every transaction.`,
      cost: 'no fee to check, and never pay to claim',
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_score: row.value_score,
    launch_odds: row.launch_odds,
    expected_value_usd: row.expected_value_usd,
    predicted_mcap_usd: row.predicted_mcap_usd,
    predicted_mcap_low_usd: row.predicted_mcap_low_usd,
    predicted_mcap_high_usd: row.predicted_mcap_high_usd,
    verdict: row.verdict,
    peer_multiple: row.model.peer_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_plan: row.farm_plan,
    farm_steps: row.farm_steps,
    evidence_chain: row.evidence_chain,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
