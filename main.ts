// Ember Yard — hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/: plain files a browser loads as
// ES modules, three.js 0.187.0 vendored under game/vendor/, no build step and
// no network. This program copies game/ and screenshots/ into the output
// directory and writes the dossier the judge reads, using the kit's own
// library (vendor/makefun-threejs.ts) so the bytes match the gate's rebuild.
//
// In the grader the output directory is /output; locally it is whatever
// MAKEFUN_OUTPUT_DIR names:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with: node serve.ts  (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own: dossier text at 160 KiB, at most 4
// screenshots of at most 256 KiB, game/ at most 993 entries and 48 MiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
