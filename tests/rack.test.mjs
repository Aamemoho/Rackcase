import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCartridge } from '../scripts/validate-cartridge.mjs';
import { clearLedger, readLedger, spend, isUnlocked, resolveCarry } from '../public/js/ledger.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function makeFixture(meta, html) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rack-fixture-'));
  await writeFile(path.join(dir, 'cartridge.json'), JSON.stringify(meta, null, 2));
  await writeFile(path.join(dir, 'index.html'), html);
  return dir;
}

const validMeta = {
  id: 'fixture-card',
  title: 'Fixture Card',
  subtitle: 'A test cartridge.',
  status: 'prototype',
  entry: 'index.html',
  aiAssisted: true,
  credits: 'AI-assisted; directed and selected by aamemoho.',
  published: true,
  capabilities: []
};

test('the first real cartridge validates', async () => {
  const result = await validateCartridge(path.join(root, 'incoming/crt-2026-0725-a'));
  assert.deepEqual(result.errors, []);
  assert.equal(result.meta.id, 'crt-2026-0725-a');
});

test('missing required metadata is rejected', async () => {
  const dir = await makeFixture({ ...validMeta, title: '' }, '<!doctype html><title>x</title>');
  try {
    const result = await validateCartridge(dir);
    assert.ok(result.errors.some((e) => e.code === 'missing-field' && e.field === 'title'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('undeclared external network code is rejected', async () => {
  const dir = await makeFixture(validMeta, '<!doctype html><script>fetch("https://example.com/x")</script>');
  try {
    const result = await validateCartridge(dir);
    assert.ok(result.errors.some((e) => e.code === 'undeclared-network'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('undeclared network code in a linked local script is rejected', async () => {
  const dir = await makeFixture(validMeta, '<!doctype html><script src="worker.js"></script>');
  await writeFile(path.join(dir, 'worker.js'), 'fetch("https://example.com/x")');
  try {
    const result = await validateCartridge(dir);
    assert.ok(result.errors.some((e) => e.code === 'undeclared-network'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('declared parent bridge is allowed while undeclared parent access is rejected', async () => {
  const html = '<!doctype html><script>window.parent.postMessage({type:"hello"}, "*")</script>';
  const undeclared = await makeFixture(validMeta, html);
  const declared = await makeFixture({ ...validMeta, capabilities: ['parent-bridge'] }, html);
  try {
    const rejected = await validateCartridge(undeclared);
    const accepted = await validateCartridge(declared);
    assert.ok(rejected.errors.some((e) => e.code === 'undeclared-parent-bridge'));
    assert.ok(!accepted.errors.some((e) => e.code === 'undeclared-parent-bridge'));
  } finally {
    await rm(undeclared, { recursive: true, force: true });
    await rm(declared, { recursive: true, force: true });
  }
});

test('path traversal references are rejected', async () => {
  const dir = await makeFixture(validMeta, '<!doctype html><script src="../secret.js"></script>');
  try {
    const result = await validateCartridge(dir);
    assert.ok(result.errors.some((e) => e.code === 'path-escape'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Cloudflare _headers uses valid route and header lines', async () => {
  const text = await readFile(path.join(root, 'public/_headers'), 'utf8');
  let inRoute = false;
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      assert.ok(line.startsWith('/'), `line ${index + 1}: route must start with /`);
      inRoute = true;
    } else {
      assert.ok(inRoute, `line ${index + 1}: header before route`);
      assert.match(line.trim(), /^[A-Za-z0-9-]+:\s*.+$/, `line ${index + 1}: malformed header`);
    }
  }
});

test('catalog removes Wave Striker from the rack while preserving the other public works', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'public/data/catalog.json'), 'utf8'));
  assert.equal(catalog.items.length, 5);
  assert.ok(catalog.items.some((item) => item.id === 'crt-2026-0725-a'));
  assert.ok(catalog.items.some((item) => item.id === 'sphere'));
  const media = catalog.items.find((item) => item.id === 'field-log-01');
  assert.equal(media.kind, 'media');
  assert.equal(media.href, '/media/field-log-01/');
  assert.equal(media.poster, '/media/field-log-01/poster.webp');
  const glowlog = catalog.items.find((item) => item.id === 'glowlog');
  assert.equal(glowlog.kind, 'app');
  assert.equal(glowlog.href, '/glowlog/');
  assert.equal(catalog.items.find((item) => item.id === 'wave-striker-chain-rush'), undefined);
  const photogenesis = catalog.items.find((item) => item.id === 'photogenesis');
  assert.equal(photogenesis.kind, 'cartridge');
  assert.equal(photogenesis.entry, '/cartridges/photogenesis/index.html?v=20260801-afterimage-rhythm');
  assert.equal(photogenesis.href, '/play.html?id=photogenesis');
  assert.equal(photogenesis.aiAssisted, true);
  assert.equal(photogenesis.presentation.mode, 'immersive-landscape');
  assert.equal(photogenesis.presentation.orientation, 'landscape');
  assert.equal(catalog.items[0].id, 'crt-2026-0725-a');
  assert.equal(catalog.items[4].id, 'photogenesis');
});

test('Photogenesis is self-contained and preserves the supplied afterimage opening and shutter takes', async () => {
  const base = path.join(root, 'public/cartridges/photogenesis');
  const html = await readFile(path.join(base, 'index.html'), 'utf8');
  const game = await readFile(path.join(base, 'game.js'), 'utf8');
  const playerHtml = await readFile(path.join(root, 'public/play.html'), 'utf8');
  const player = await readFile(path.join(root, 'public/js/play.js'), 'utf8');
  const styles = await readFile(path.join(base, 'styles.css'), 'utf8');
  const credits = await readFile(path.join(base, 'CREDITS.md'), 'utf8');
  const license = await readFile(path.join(base, 'LICENSES/THREE-LICENSE.txt'), 'utf8');
  const audio = await readdir(path.join(base, 'audio'));
  assert.match(html, /src="\.\/vendor\/three\.min\.js"/);
  assert.match(html, /styles\.css\?v=20260801-afterimage/);
  assert.match(html, /src="\.\/game\.js\?v=20260801-afterimage-rhythm"/);
  assert.match(html, /id="gameStart"/);
  assert.match(html, /id="awaken"/);
  assert.doesNotMatch(html + game, /https?:\/\//);
  assert.deepEqual(audio.sort(), [
    'breath.mp3',
    'shutter_take_01.mp3',
    'shutter_take_02.mp3',
    'shutter_take_03.mp3',
    'shutter_take_04.mp3',
    'shutter_take_05.mp3',
    'shutter_take_06.mp3',
    'shutter_take_07.mp3'
  ]);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.match(game, /createOscillator/);
  assert.match(game, /function shutterBlink\(\)/);
  assert.match(game, /function startAwaken\(\)/);
  assert.match(game, /\},1050\);/);
  assert.match(game, /setTimeout\(openEyes,3550\)/);
  assert.match(game, /captureAt:0\.97,releaseAt:1\.30/);
  assert.match(game, /aamemoho:photogenesis-start/);
  assert.match(game, /aamemoho:intro-status/);
  assert.match(game, /shutter_take_07\.mp3/);
  assert.match(game, /photogenesis-0f1-save-v1/);
  assert.match(player, /aamemoho:save-write/);
  assert.match(player, /sendCartridgeStart/);
  assert.match(player, /hasEnteredFullscreen/);
  assert.match(player, /가로 전체화면으로 다시 시작/);
  assert.match(player, /fullscreenchange/);
  assert.doesNotMatch(playerHtml, /allow-same-origin/);
  assert.match(playerHtml, /allow="autoplay; fullscreen"/);
  assert.match(styles, /이동 영역/);
  assert.match(styles, /#awaken\.open \.lid\.top/);
  assert.match(credits, /e199831cfc09e42c9058597e94bca4bc3f4a2c474f264cf2e34f1c92b9265102/);
  assert.match(license, /MIT License/);
});

test('rack ledger keeps the first irreversible choice and resolves lock/carry separately', () => {
  clearLedger();
  const source = 'crt-2026-0725-a';
  const target = {
    requires: { spent: [source] },
    subtitle: 'base',
    accent: '#base',
    carry: [{ from: source, byChoice: {
      A: { subtitle: 'carried A', accent: '#00d9f4' },
      B: { subtitle: 'carried B', accent: '#ffd700' }
    } }]
  };

  assert.equal(isUnlocked(target, readLedger()), false);
  spend(source, 'A');
  spend(source, 'B');
  const ledger = readLedger();
  assert.equal(ledger.spent[source].choice, 'A');
  assert.equal(isUnlocked(target, ledger), true);
  assert.deepEqual(
    { subtitle: resolveCarry(target, ledger).subtitle, accent: resolveCarry(target, ledger).accent },
    { subtitle: 'carried A', accent: '#00d9f4' }
  );
  clearLedger();
});

test('rack patch graft preserves modern player features while sealing the first cartridge choice', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'public/data/catalog.json'), 'utf8'));
  const player = await readFile(path.join(root, 'public/js/play.js'), 'utf8');
  const hub = await readFile(path.join(root, 'public/js/hub.js'), 'utf8');
  const cartridge = await readFile(path.join(root, 'public/cartridges/crt-2026-0725-a/cartridge.js'), 'utf8');
  const cartridgeHtml = await readFile(path.join(root, 'public/cartridges/crt-2026-0725-a/index.html'), 'utf8');
  const sphere = catalog.items.find((item) => item.id === 'sphere');

  assert.deepEqual(sphere.requires, { spent: ['crt-2026-0725-a'] });
  assert.equal(sphere.carry[0].from, 'crt-2026-0725-a');
  assert.match(hub, /isUnlocked/);
  assert.match(hub, /is-locked/);
  assert.match(player, /rack:hello/);
  assert.match(player, /rack:spend/);
  assert.match(player, /aamemoho:save-write/);
  assert.match(player, /sendCartridgeStart/);
  assert.match(cartridge, /rack:ack/);
  assert.match(cartridge, /rack:spend/);
  assert.match(cartridgeHtml, /선택은 한 번뿐입니다/);
});

test('status page exposes the public checkpoint and copy controls', async () => {
  const html = await readFile(path.join(root, 'public/status/index.html'), 'utf8');
  const script = await readFile(path.join(root, 'public/status/status.js'), 'utf8');
  assert.match(html, /CHECKPOINT 2026-07-26-A/);
  assert.match(html, /id="copy-context"/);
  assert.match(html, /id="context-plain"/);
  assert.match(script, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(html, /\/opt\/data|147\.93\.81\.128|BEGIN PRIVATE KEY|API_KEY/);
});

test('rack links to status and status assets are not cached', async () => {
  const index = await readFile(path.join(root, 'public/index.html'), 'utf8');
  const headers = await readFile(path.join(root, 'public/_headers'), 'utf8');
  assert.match(index, /href="\/status\/"/);
  assert.match(headers, /\/status\/\*\n\s+Cache-Control: no-store/);
});
