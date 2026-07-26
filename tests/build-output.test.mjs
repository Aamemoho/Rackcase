import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('production build contains rack root and GlowLog route', async () => {
  const rack = await text('dist/index.html');
  const glowlog = await text('dist/glowlog/index.html');

  assert.match(rack, /aamemoho/i);
  assert.match(glowlog, /GlowLog/);
  assert.match(glowlog, /glowlog:entries/);
  assert.match(glowlog, /localStorage/);
  assert.doesNotMatch(glowlog, /window\.storage/);
});

test('GlowLog is emitted as one self-contained HTML document', async () => {
  const glowlog = await text('dist/glowlog/index.html');
  assert.match(glowlog, /<style/i);
  assert.match(glowlog, /<script[^>]*type="module"[^>]*>/i);
  assert.doesNotMatch(glowlog, /<script[^>]+src=/i);
});
