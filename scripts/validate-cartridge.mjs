import { access, readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['id', 'title', 'subtitle', 'status', 'entry', 'aiAssisted', 'published'];
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUS = new Set(['prototype', 'live', 'archived', 'private']);

function issue(code, message, extra = {}) { return { code, message, ...extra }; }
async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function walk(dir, root = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isSymbolicLink()) { files.push({ rel, full, symlink: true }); continue; }
    if (entry.isDirectory()) files.push(...await walk(full, root));
    else if (entry.isFile()) files.push({ rel, full, symlink: false });
  }
  return files;
}

export async function validateCartridge(inputDir) {
  const dir = path.resolve(inputDir);
  const errors = [];
  const warnings = [];
  let meta = {};
  const metaPath = path.join(dir, 'cartridge.json');

  if (!await exists(metaPath)) {
    return { ok: false, dir, meta, errors: [issue('missing-metadata', 'cartridge.json is required')], warnings };
  }

  try { meta = JSON.parse(await readFile(metaPath, 'utf8')); }
  catch (error) {
    return { ok: false, dir, meta, errors: [issue('invalid-json', error.message)], warnings };
  }

  for (const field of REQUIRED) {
    const value = meta[field];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      errors.push(issue('missing-field', `Required field is empty: ${field}`, { field }));
    }
  }
  if (meta.id && !ID_RE.test(meta.id)) errors.push(issue('invalid-id', 'id must be lowercase kebab-case'));
  if (meta.id && path.basename(dir) !== meta.id) warnings.push(issue('directory-id-mismatch', 'directory name differs from metadata id'));
  if (meta.status && !STATUS.has(meta.status)) errors.push(issue('invalid-status', `Unsupported status: ${meta.status}`));
  if (typeof meta.published !== 'boolean') errors.push(issue('invalid-published', 'published must be boolean'));
  if (typeof meta.aiAssisted !== 'boolean') errors.push(issue('invalid-ai-assisted', 'aiAssisted must be boolean'));
  if (meta.aiAssisted && (!meta.credits || !String(meta.credits).trim())) errors.push(issue('missing-credits', 'AI-assisted cartridges require credits'));
  if (meta.capabilities !== undefined && !Array.isArray(meta.capabilities)) errors.push(issue('invalid-capabilities', 'capabilities must be an array'));

  const entryRel = typeof meta.entry === 'string' ? meta.entry : '';
  const entryPath = path.resolve(dir, entryRel);
  if (!entryRel || !(entryPath === dir || entryPath.startsWith(dir + path.sep))) {
    errors.push(issue('path-escape', 'entry escapes the cartridge directory', { ref: entryRel }));
    return { ok: false, dir, meta, errors, warnings };
  }
  if (!await exists(entryPath)) {
    errors.push(issue('missing-entry', `Entry file not found: ${entryRel}`));
    return { ok: false, dir, meta, errors, warnings };
  }

  const files = await walk(dir);
  for (const file of files) {
    if (file.symlink) errors.push(issue('symlink-blocked', 'Symlinks are not accepted', { file: file.rel }));
    if (/(^|\/)(\.env|auth\.json|credentials?\.)/i.test(file.rel)) errors.push(issue('secret-file', 'Credential-like file is not accepted', { file: file.rel }));
  }

  const html = await readFile(entryPath, 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(?:#|data:|blob:|mailto:|tel:)/i.test(ref)) continue;
    if (/^javascript:/i.test(ref)) { errors.push(issue('javascript-url', 'javascript: URLs are blocked', { ref })); continue; }
    if (/^https?:\/\//i.test(ref)) { errors.push(issue('external-origin', 'External assets must be vendored into the cartridge', { ref })); continue; }
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
    const resolved = path.resolve(dir, clean);
    if (!(resolved === dir || resolved.startsWith(dir + path.sep))) {
      errors.push(issue('path-escape', 'Referenced path escapes the cartridge directory', { ref }));
    } else if (!await exists(resolved)) {
      errors.push(issue('missing-asset', 'Referenced local asset does not exist', { ref }));
    }
  }

  const scanSources = [{ file: entryRel, text: html }];
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const [index, code] of inlineScripts.entries()) {
    const checked = spawnSync(process.execPath, ['--check', '-'], { input: code, encoding: 'utf8' });
    if (checked.status !== 0) errors.push(issue('javascript-syntax', `Inline script ${index + 1} has invalid syntax`, { detail: (checked.stderr || '').trim() }));
  }

  const vendorHashes = meta.vendorHashes && typeof meta.vendorHashes === 'object' ? meta.vendorHashes : {};
  for (const file of files.filter((candidate) => !candidate.symlink && /\.(?:m?js)$/i.test(candidate.rel))) {
    const text = await readFile(file.full, 'utf8');
    const checked = spawnSync(process.execPath, ['--check', '-'], { input: text, encoding: 'utf8' });
    if (checked.status !== 0) errors.push(issue('javascript-syntax', `Local script has invalid syntax: ${file.rel}`, { file: file.rel, detail: (checked.stderr || '').trim() }));
    const expectedHash = vendorHashes[file.rel];
    if (expectedHash) {
      const actualHash = createHash('sha256').update(text).digest('hex');
      if (actualHash !== expectedHash) errors.push(issue('vendor-hash-mismatch', `Pinned vendor hash changed: ${file.rel}`, { file: file.rel }));
      continue;
    }
    scanSources.push({ file: file.rel, text });
  }

  const capabilities = new Set(meta.capabilities || []);
  const checks = [
    ['network', /\b(?:fetch\s*\(|XMLHttpRequest\b|sendBeacon\s*\(|EventSource\s*\()/, 'undeclared-network'],
    ['websocket', /\bWebSocket\s*\(/, 'undeclared-websocket'],
    ['camera', /\bgetUserMedia\s*\(/, 'undeclared-camera'],
    ['geolocation', /\bnavigator\.geolocation\b/, 'undeclared-geolocation'],
    ['form-submit', /<form\b|\.submit\s*\(/i, 'undeclared-form-submit']
  ];
  for (const source of scanSources) {
    for (const [capability, regex, code] of checks) {
      if (regex.test(source.text) && !capabilities.has(capability)) errors.push(issue(code, `Detected capability must be declared: ${capability}`, { capability, file: source.file }));
    }
  }
  const hardBlocks = [
    [/\bdocument\.cookie\b/, 'cookie-access'],
    [/\b(?:eval|Function)\s*\(/, 'dynamic-code'],
    [/\b(?:window\.)?(?:top|parent)\b/, 'parent-access'],
    [/file:\/\//i, 'file-url']
  ];
  for (const source of scanSources) {
    for (const [regex, code] of hardBlocks) if (regex.test(source.text)) errors.push(issue(code, `Blocked pattern detected: ${code}`, { file: source.file }));
  }

  return { ok: errors.length === 0, dir, meta, errors, warnings };
}

async function cli() {
  const target = process.argv[2];
  if (!target) { console.error('Usage: node scripts/validate-cartridge.mjs <directory>'); process.exit(2); }
  const result = await validateCartridge(target);
  for (const warning of result.warnings) console.warn(`WARN ${warning.code}: ${warning.message}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`BLOCK ${error.code}: ${error.message}${error.ref ? ` (${error.ref})` : ''}`);
    process.exit(1);
  }
  console.log(`CARTRIDGE_VALIDATE_OK ${result.meta.id}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch((error) => { console.error(error); process.exit(1); });
