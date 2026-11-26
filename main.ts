// token-radar-01 entry (radar-2) — Node 22, standard library only.
//
// Reads the sealed snapshot, scores every pre-token protocol with the
// model in lib/model.ts, and writes the ranked board, the dashboard data,
// the dashboard and screenshots, and the dossier the judge reads.
//
// Run it from this directory with the snapshot from the kit:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// Caps from the scorer's gate: the text cap shapes the dossier bytes,
// the other caps only refuse an oversized entry.
const dossierTextLimit = 65536;
const screenshotLimits = { max: 4, maxBytes: 524288 };
const shotNamePattern = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// Read a `--name value` or `--name=value` flag, or return the fallback.
function flagValue(name: string, fallback: string): string {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === `--${name}` && i + 1 < argv.length) return argv[i + 1]!;
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return fallback;
}

// Copy a directory's regular files into `to`, skipping dotfiles,
// and return the copied file names.
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

function fail(message: string, code: number): never {
  process.stderr.write(message);
  process.exit(code);
}

function main(): void {
  const inputArg = flagValue('input', '/input');
  const inputFile = inputArg.endsWith('.json')
    ? inputArg
    : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    fail(
      `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
      2,
    );
  }
  const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    fail(`token radar: the model wrote a board the gate refuses: ${issue}\n`, 1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  copyDirectory(join(rootDir, 'dashboard'), join(outDir, 'dashboard'));
  const shots = copyDirectory(join(rootDir, 'screenshots'), join(outDir, 'screenshots'));
  if (shots.length < 3) {
    fail(
      `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`,
      1,
    );
  }
  for (const name of shots) {
    if (!shotNamePattern.test(name)) {
      fail(
        `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`,
        1,
      );
    }
  }

  // The dossier goes last: the scorer rebuilds it from this output and
  // compares the bytes.
  writeFileSync(
    join(outDir, 'dossier.json'),
    buildDossier(outDir, {
      text_max_bytes: dossierTextLimit,
      screenshots: { max: screenshotLimits.max, max_bytes: screenshotLimits.maxBytes },
      dashboard: { max_files: 400, max_bytes: 4194304 },
    }),
  );

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
  );
}

main();
