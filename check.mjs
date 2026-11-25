// Independent validation for this entry (Node stdlib only).
// Usage from entry/:  node check.mjs [out-dir] [snapshot.json]
// Checks the sealed gate's seven rows plus the model's own consistency gates
// (Spearman TVL vs value_score < 0.9, odds/EV tracking, farm economics, dossier match).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snapPath = process.argv[3] ?? '../kit-unpacked/token-radar-01-kit/input/snapshot.json';
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const snapBySlug = new Map(snap.protocols.map((p) => [p.slug, p]));

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail: detail ?? '' });

function spearman(xs, ys) {
  const rank = (v) => {
    const order = [...v.keys()].sort((a, b) => v[a] - v[b]);
    const r = new Array(v.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]] === v[order[i]]) j++;
      const avg = (i + j) / 2;
      for (let k = i; k <= j; k++) r[order[k]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  const num = rx.reduce((s, a, i) => s + (a - mx) * (ry[i] - my), 0);
  const den = Math.sqrt(rx.reduce((s, a) => s + (a - mx) ** 2, 0) * ry.reduce((s, b) => s + (b - my) ** 2, 0));
  return num / den;
}
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// --- board shape (gate: board_file, sorted_by_value, coverage, farm_steps) ---
check('board rows 100..4000', rows.length >= 100 && rows.length <= 4000, `${rows.length} rows`);
const slugs = new Set(rows.map((r) => r.slug));
check('all slugs in snapshot', rows.every((r) => snapBySlug.has(r.slug)), `${rows.length} slugs`);
check('no duplicate slugs', slugs.size === rows.length, `${slugs.size} unique`);
const missing = snap.watchlist.filter((s) => !slugs.has(s));
check('watchlist coverage 100%', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${snap.watchlist.length}/${snap.watchlist.length}`);
const ranksOk = rows.every((r, i) => r.rank === i + 1);
check('ranks exactly 1..N', ranksOk, '');
check(
  'implied non-increasing by rank',
  rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd),
  `rank 1 $${rows[0].implied_value_usd.toLocaleString('en-US')} -> rank ${rows.length} $${rows[rows.length - 1].implied_value_usd.toLocaleString('en-US')}`,
);
check('implied values not all equal', new Set(rows.map((r) => r.implied_value_usd)).size > 1, `${new Set(rows.map((r) => r.implied_value_usd)).size} distinct`);
const badSteps = rows.filter(
  (r) => !(r.farm_steps.length >= 3 && r.farm_steps.length <= 12) || r.farm_steps.some((s) => s.trim().length < 20 || s.trim().length > 600),
);
check('farm_steps 3..12 x 20..600 chars', badSteps.length === 0, badSteps.length ? `bad: ${badSteps.slice(0, 3).map((r) => r.slug).join(', ')}` : `${rows.length} rows x ${rows[0].farm_steps.length} steps`);
check('board.json <= 8 MiB', statSync(join(out, 'board.json')).size <= 8 * 1024 * 1024, `${statSync(join(out, 'board.json')).size} bytes`);

// --- model consistency gates (the entry's own bar, stricter than the sealed gate) ---
const spTVL = spearman(rows.map((r) => r.tvl_usd), rows.map((r) => r.value_score));
check('Spearman TVL rank vs value_score rank < 0.9', spTVL < 0.9, spTVL.toFixed(4));
const spOdds = spearman(rows.map((r) => r.launch_odds), rows.map((r) => r.value_score));
check('Spearman launch_odds vs value_score >= 0.3', spOdds >= 0.3, spOdds.toFixed(4));
const spEV = spearman(rows.map((r) => r.expected_value_usd), rows.map((r) => r.value_score));
check('Spearman expected_value vs value_score >= 0.3', spEV >= 0.3, spEV.toFixed(4));
const oddsMean = rows.reduce((s, r) => s + r.launch_odds, 0) / rows.length;
check('launch_odds mean in (0.05, 0.95)', oddsMean > 0.05 && oddsMean < 0.95, oddsMean.toFixed(4));
check('value_score >= 10 distinct', new Set(rows.map((r) => r.value_score)).size >= 10, `${new Set(rows.map((r) => r.value_score)).size} distinct`);
check('launch_odds >= 5 distinct', new Set(rows.map((r) => r.launch_odds)).size >= 5, `${new Set(rows.map((r) => r.launch_odds)).size} distinct`);
check('expected_value >= 5 distinct', new Set(rows.map((r) => r.expected_value_usd)).size >= 5, `${new Set(rows.map((r) => r.expected_value_usd)).size} distinct`);
const ratios = rows.map((r) => r.predicted_mcap_high_usd / r.predicted_mcap_low_usd);
check('median predicted high/low >= 1.5', median(ratios) >= 1.5, median(ratios).toFixed(2));
const evBad = rows.filter((r) => r.expected_value_usd !== Math.round(r.launch_odds * r.implied_value_usd));
check('expected_value = round(odds x implied)', evBad.length === 0, evBad.length ? `bad: ${evBad.slice(0, 3).map((r) => r.slug).join(', ')}` : '');
const farmBad = rows.filter((r) => {
  const fp = r.farm_plan;
  const total = Math.round((fp.gas_usd + fp.time_hours * fp.hourly_rate_usd) * 100) / 100;
  return (
    Math.abs(total - fp.total_cost_usd) > 0.011 ||
    Math.abs(Math.round((fp.expected_airdrop_usd - fp.total_cost_usd) * 100) / 100 - fp.net_usd) > 0.011 ||
    Math.abs(Math.round((fp.net_usd / fp.total_cost_usd) * 1e4) / 1e4 - fp.roi) > 0.00011 ||
    fp.expected_airdrop_usd > 0.5 * r.predicted_mcap_usd
  );
});
check('farm economics consistent (total/net/roi/airdrop cap)', farmBad.length === 0, farmBad.length ? `bad: ${farmBad.slice(0, 3).map((r) => r.slug).join(', ')}` : `${rows.length} rows`);

// --- dashboard (gate: dashboard_files) ---
const dashFiles = readdirSync(join(out, 'dashboard'));
const dashBytes = dashFiles.reduce((s, f) => s + statSync(join(out, 'dashboard', f)).size, 0);
check('dashboard has index.html + css + js', dashFiles.includes('index.html') && dashFiles.some((f) => f.endsWith('.css')) && dashFiles.some((f) => f.endsWith('.js')), dashFiles.join(', '));
check('dashboard source < 64 KiB (judge reads it whole)', dashBytes < 65536, `${dashBytes} bytes`);
const noNet = dashFiles.every((f) => {
  const text = readFileSync(join(out, 'dashboard', f), 'utf8');
  return !/https?:\/\//.test(text);
});
check('dashboard names no http(s) address', noNet, '');
const data = readFileSync(join(out, 'data.js'), 'utf8');
const radarData = JSON.parse(data.replace(/^window\.RADAR=/, '').replace(/;\s*$/, ''));
check('data.js rows match board', radarData.rows.length === rows.length && radarData.live.length === 24, `${radarData.rows.length} board rows, ${radarData.live.length} live`);

// --- screenshots (gate: screenshots) ---
const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.')).sort();
check('screenshots: 3..4 images', shots.length >= 3 && shots.length <= 4, shots.join(', '));
let shotsOk = true;
let shotDetail = '';
for (const f of shots) {
  const buf = readFileSync(join(out, 'screenshots', f));
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const w = isPng ? buf.readUInt32BE(16) : 0;
  const h = isPng ? buf.readUInt32BE(20) : 0;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (!isPng && !isJpeg) { shotsOk = false; shotDetail += `${f}: not PNG/JPEG. `; }
  if (buf.length > 512 * 1024) { shotsOk = false; shotDetail += `${f}: ${buf.length} bytes > 512 KiB. `; }
  if (isPng && (long > 1440 || short < 800)) { shotsOk = false; shotDetail += `${f}: ${w}x${h}. `; }
  shotDetail += `${f} ${w}x${h} ${buf.length} bytes. `;
}
check('screenshots valid PNG/JPEG, <=512 KiB, long<=1440, short>=800', shotsOk, shotDetail.trim());

// --- dossier (gate: dossier_matches) ---
const dossierOnDisk = readFileSync(join(out, 'dossier.json'));
const rebuilt = Buffer.from(buildDossier(out, { text_max_bytes: 65536 }));
check('dossier.json byte-identical to buildDossier(out, {text_max_bytes: 65536})', dossierOnDisk.equals(rebuilt), `${dossierOnDisk.length} bytes`);
check('dossier.json <= 1.5 MiB', dossierOnDisk.length <= 1.5 * 1024 * 1024, `${dossierOnDisk.length} bytes`);

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  if (!r.pass) failed++;
}
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} checks FAILED.`);
process.exit(failed === 0 ? 0 : 1);
