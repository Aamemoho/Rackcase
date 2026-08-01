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

test('production build contains the irreversible-choice ledger graft without losing current cartridges', async () => {
  const catalog = JSON.parse(await text('dist/data/catalog.json'));
  const rack = await text('dist/index.html');
  const hub = await text('dist/js/hub.js');
  const ledger = await text('dist/js/ledger.js');
  const player = await text('dist/js/play.js');
  const cartridgeHtml = await text('dist/cartridges/crt-2026-0725-a/index.html');
  const cartridge = await text('dist/cartridges/crt-2026-0725-a/cartridge.js');
  const sphere = catalog.items.find((item) => item.id === 'sphere');

  assert.equal(catalog.items.length, 6);
  assert.deepEqual(sphere.requires, { spent: ['crt-2026-0725-a'] });
  assert.equal(catalog.items[1].id, 'field-log-01');
  assert.equal(catalog.items[2].id, 'sphere');
  assert.match(rack, /hub\.js\?v=20260801-ledger/);
  assert.match(hub, /ledger\.js\?v=20260801-ledger/);
  assert.match(ledger, /rack:ledger:v1/);
  assert.match(player, /rack:ack/);
  assert.match(player, /aamemoho:save-write/);
  assert.match(cartridgeHtml, /cartridge\.js\?v=20260801-ledger/);
  assert.match(cartridge, /rack:spend/);
});

test('production build contains a self-contained Photogenesis cartridge', async () => {
  const catalog = JSON.parse(await text('dist/data/catalog.json'));
  const html = await text('dist/cartridges/photogenesis/index.html');
  const game = await text('dist/cartridges/photogenesis/game.js');
  const playerHtml = await text('dist/play.html');
  const player = await text('dist/js/play.js');
  const vendor = await text('dist/cartridges/photogenesis/vendor/three.min.js');
  const audio = await readdir(path.join(root, 'dist/cartridges/photogenesis/audio'));
  assert.ok(catalog.items.some((item) => item.id === 'photogenesis'));
  assert.equal(catalog.items.find((item) => item.id === 'photogenesis').presentation.mode, 'immersive-landscape');
  assert.match(catalog.items.find((item) => item.id === 'photogenesis').entry, /\?v=20260801-afterimage-rhythm$/);
  assert.match(html, /\.\/vendor\/three\.min\.js/);
  assert.doesNotMatch(html + game, /https?:\/\//);
  assert.equal(audio.filter((name) => name.endsWith('.mp3')).length, 8);
  assert.match(game, /shutter_take_07\.mp3/);
  assert.match(game, /function startAwaken\(\)/);
  assert.match(vendor, /SPDX-License-Identifier: MIT/);
  assert.match(player, /requestFullscreen/);
  assert.match(player, /orientation\.lock/);
  assert.match(player, /aamemoho:save-write/);
  assert.match(player, /sendCartridgeStart/);
  assert.match(game, /function shutterBlink\(\)/);
  assert.match(game, /photogenesis-0f1-save-v1/);
  assert.doesNotMatch(playerHtml, /allow-same-origin/);
});
