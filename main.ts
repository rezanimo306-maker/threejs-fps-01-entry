// main.ts — hands the EMBERLINE entry in: copies game/ and screenshots/ from
// this repository to the output directory and writes /output/dossier.json with
// buildDossier from vendor/makefun-threejs.ts. Node 22, standard library only.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const repoDir = dirname(fileURLToPath(import.meta.url));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`wrote ${outDir}/dossier.json`);
