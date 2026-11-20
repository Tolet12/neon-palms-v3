// NEON PALMS v2 — hand-in program for the make.fun gta6-01 entry.
//
// The game itself is the static site under game/ (plain ES modules plus a
// vendored Three.js build, no build step, no network). This program copies
// game/ and screenshots/ into the output directory and writes the dossier
// the judge reads, using the vendored make.fun library with the scorer's
// own limits.
//
// Run locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(here, 'game'), join(outputDir, 'game'), { recursive: true });

mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(here, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
