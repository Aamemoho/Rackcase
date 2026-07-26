import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public');
const glowlogSource = path.join(root, 'apps/glowlog/dist/index.html');
const target = process.env.RACK_DIST_DIR
  ? path.resolve(process.env.RACK_DIST_DIR)
  : path.join(root, 'dist');

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
await mkdir(path.join(target, 'glowlog'), { recursive: true });
await cp(glowlogSource, path.join(target, 'glowlog/index.html'));
const catalog = await readFile(path.join(target, 'data/catalog.json'));
const manifest = {
  builtAt: new Date().toISOString(),
  catalogSha256: createHash('sha256').update(catalog).digest('hex')
};
await writeFile(path.join(target, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`BUILD_OK ${target}`);
