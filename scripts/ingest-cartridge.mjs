import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCartridge } from './validate-cartridge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const incomingRoot = path.join(root, 'incoming');
const catalogPath = path.join(publicDir, 'data/catalog.json');

async function discover() {
  const entries = await readdir(incomingRoot, { withFileTypes: true });
  const items = [];
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(incomingRoot, entry.name);
    const result = await validateCartridge(dir);
    if (!result.ok) {
      const summary = result.errors.map((e) => `${e.code}: ${e.message}`).join('; ');
      throw new Error(`INGEST_BLOCKED ${entry.name} — ${summary}`);
    }
    if (!result.meta.published) continue;
    items.push({
      id: result.meta.id,
      kind: 'cartridge',
      title: result.meta.title,
      subtitle: result.meta.subtitle,
      status: result.meta.status,
      aiAssisted: result.meta.aiAssisted,
      credits: result.meta.credits || '',
      accent: result.meta.accent || '#7bdbe8',
      order: Number.isFinite(result.meta.order) ? result.meta.order : 100,
      entry: `/cartridges/${result.meta.id}/${result.meta.entry}`,
      href: `/play.html?id=${encodeURIComponent(result.meta.id)}`
    });
  }
  const externals = JSON.parse(await readFile(path.join(root, 'config/external-projects.json'), 'utf8'));
  return [...externals.items, ...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title));
}

async function atomicReplaceDir(source, target) {
  const stage = `${target}.stage-${process.pid}`;
  const backup = `${target}.backup-${process.pid}`;
  await rm(stage, { recursive: true, force: true });
  await cp(source, stage, { recursive: true, force: false, errorOnExist: true });
  let hadTarget = false;
  try { await rename(target, backup); hadTarget = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await rename(stage, target);
    if (hadTarget) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    if (hadTarget) await rename(backup, target);
    throw error;
  }
}

async function main() {
  const requested = process.argv[2];
  if (!requested) throw new Error('Usage: node scripts/ingest-cartridge.mjs <incoming-directory>');
  const source = path.resolve(root, requested);
  const result = await validateCartridge(source);
  if (!result.ok) {
    for (const error of result.errors) console.error(`BLOCK ${error.code}: ${error.message}`);
    throw new Error(`INGEST_BLOCKED ${result.meta.id || path.basename(source)}`);
  }

  const items = await discover();
  await mkdir(path.join(publicDir, 'cartridges'), { recursive: true });
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await atomicReplaceDir(source, path.join(publicDir, 'cartridges', result.meta.id));

  const catalog = { version: 1, generatedAt: new Date().toISOString(), items };
  const tempCatalog = `${catalogPath}.tmp-${process.pid}`;
  await writeFile(tempCatalog, JSON.stringify(catalog, null, 2) + '\n');
  await rename(tempCatalog, catalogPath);

  console.log(`CARTRIDGE_VALIDATE_OK ${result.meta.id}`);
  console.log(`CATALOG_UPDATED ${items.length}`);
  console.log(`INGEST_OK public/cartridges/${result.meta.id}/`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
