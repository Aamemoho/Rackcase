import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function glowlogAssets() {
  const directory = 'dist/glowlog/assets';
  const names = await readdir(path.join(root, directory));
  const jsName = names.find((name) => name.endsWith('.js'));
  const cssName = names.find((name) => name.endsWith('.css'));
  assert.ok(jsName, 'GlowLog JavaScript asset is missing');
  assert.ok(cssName, 'GlowLog CSS asset is missing');
  return {
    jsName,
    cssName,
    js: await text(`${directory}/${jsName}`),
  };
}

test('production build contains rack root and GlowLog route', async () => {
  const rack = await text('dist/index.html');
  const glowlog = await text('dist/glowlog/index.html');
  const assets = await glowlogAssets();

  assert.match(rack, /aamemoho/i);
  assert.match(glowlog, /GlowLog/);
  assert.match(assets.js, /glowlog:entries/);
  assert.match(assets.js, /localStorage/);
  assert.doesNotMatch(assets.js, /window\.storage/);
});

test('GlowLog uses same-origin hashed assets compatible with the rack CSP', async () => {
  const glowlog = await text('dist/glowlog/index.html');
  const assets = await glowlogAssets();

  assert.match(glowlog, new RegExp(`src="\\./assets/${assets.jsName.replaceAll('.', '\\.')}`));
  assert.match(glowlog, new RegExp(`href="\\./assets/${assets.cssName.replaceAll('.', '\\.')}`));
  assert.doesNotMatch(glowlog, /<script[^>]*type="module"[^>]*>\s*[^<]/i);
});

test('production build contains a self-contained Photogenesis cartridge', async () => {
  const catalog = JSON.parse(await text('dist/data/catalog.json'));
  const html = await text('dist/cartridges/photogenesis/index.html');
  const game = await text('dist/cartridges/photogenesis/game.js');
  const playerHtml = await text('dist/play.html');
  const player = await text('dist/js/play.js');
  const vendor = await text('dist/cartridges/photogenesis/vendor/three.min.js');
  assert.ok(catalog.items.some((item) => item.id === 'photogenesis'));
  assert.equal(catalog.items.find((item) => item.id === 'photogenesis').presentation.mode, 'immersive-landscape');
  assert.match(catalog.items.find((item) => item.id === 'photogenesis').entry, /\?v=20260801-continuity$/);
  assert.match(html, /\.\/vendor\/three\.min\.js/);
  assert.doesNotMatch(html + game, /https?:\/\//);
  assert.doesNotMatch(html + game, /\.mp3\b/);
  assert.match(vendor, /SPDX-License-Identifier: MIT/);
  assert.match(player, /requestFullscreen/);
  assert.match(player, /orientation\.lock/);
  assert.match(player, /aamemoho:save-write/);
  assert.match(game, /function shutterBlink\(\)/);
  assert.match(game, /photogenesis-0f1-save-v1/);
  assert.doesNotMatch(playerHtml, /allow-same-origin/);
});
