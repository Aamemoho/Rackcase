import { readLedger, isUnlocked, resolveCarry, lockedView, see } from './ledger.js?v=20260801-ledger';

const grid = document.querySelector('#card-grid');
const status = document.querySelector('#rack-status');

function tag(text) {
  const node = document.createElement('span');
  node.className = 'tag';
  node.textContent = text;
  return node;
}

function cartridgeWindow(item) {
  const node = document.createElement('div');
  node.className = 'cartridge-window';
  node.setAttribute('aria-hidden', 'true');
  if (item.poster) {
    const image = document.createElement('img');
    image.src = item.poster;
    image.alt = '';
    image.decoding = 'async';
    node.append(image);
  }
  return node;
}

function kindLabel(item) {
  if (item.kind === 'external') return 'REMOTE';
  if (item.kind === 'media') return 'MEDIA';
  if (item.kind === 'app') return 'APP';
  return 'LOCAL';
}

function enterLabel(item) {
  if (item.kind === 'external') return '독립 세계 ↗';
  if (item.kind === 'media') return '영상 열기 →';
  if (item.kind === 'app') return '앱 열기 →';
  return '카트리지 삽입 →';
}

function card(item, index, { locked = false, spent = false } = {}) {
  // 잠긴 슬롯은 링크가 아니라 자리다. 누를 수 없어야 누를 수 없다는 게 전달된다.
  const node = document.createElement(locked ? 'div' : 'a');
  node.className = locked ? 'card is-locked' : 'card';
  node.dataset.kind = item.kind;
  node.style.setProperty('--accent', item.accent || '#9bb8c6');

  if (locked) {
    node.setAttribute('aria-disabled', 'true');
  } else {
    node.href = item.href;
    if (item.kind === 'external') node.rel = 'external';
    node.addEventListener('click', () => see(item.id));
  }

  const top = document.createElement('div');
  top.className = 'card-top';
  const n = document.createElement('span');
  n.className = 'card-index';
  n.textContent = `SLOT ${String(index + 1).padStart(2, '0')}`;
  const kind = document.createElement('span');
  kind.className = 'card-slot';
  kind.textContent = locked ? 'SEALED' : kindLabel(item);
  top.append(n, kind);

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const copy = document.createElement('p');
  copy.className = 'card-copy';
  copy.textContent = item.subtitle;
  body.append(title, copy);

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  foot.append(tag(item.status));
  if (item.aiAssisted) foot.append(tag('AI-assisted'));
  if (spent) {
    const marker = tag('지불됨');
    marker.classList.add('spent-tag');
    foot.append(marker);
  }
  const enter = document.createElement('span');
  enter.className = 'enter';
  enter.textContent = locked ? '잠김' : enterLabel(item);
  foot.append(enter);

  node.append(top, cartridgeWindow(item), body, foot);
  node.setAttribute('aria-label', `${item.title}: ${item.subtitle}`);
  return node;
}

function fallbackItem() {
  return {
    id: 'sphere', kind: 'external', title: '침식의 길',
    subtitle: '걷고, 흔적을 남기고, 다른 빛을 스친다.', status: 'live',
    aiAssisted: true, accent: '#d8e8f0', href: 'https://sphere.aamemoho.com'
  };
}

async function loadRack() {
  try {
    const response = await fetch('./data/catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const catalog = await response.json();
    const items = Array.isArray(catalog.items) ? catalog.items : [];
    if (items.length === 0) throw new Error('catalog is empty');

    const ledger = readLedger();
    let sealedCount = 0;

    const cards = items.map((item, index) => {
      const unlocked = isUnlocked(item, ledger);
      if (!unlocked) {
        sealedCount += 1;
        return card(lockedView(item), index, { locked: true });
      }
      return card(resolveCarry(item, ledger), index, { spent: Boolean(ledger.spent[item.id]) });
    });

    grid.replaceChildren(...cards);
    status.textContent = sealedCount > 0
      ? `${String(items.length).padStart(2, '0')} SLOTS · ${String(sealedCount).padStart(2, '0')} SEALED`
      : `${String(items.length).padStart(2, '0')} SLOTS · INDEX READY`;
  } catch (error) {
    status.classList.add('error');
    status.textContent = 'INDEX DEGRADED · REMOTE ONLY';
    grid.replaceChildren(card(fallbackItem(), 0));
    console.error(error);
  }
}

loadRack();

// 카트리지에서 돌아왔을 때 랙이 옛 상태로 남아 있지 않도록.
addEventListener('pageshow', (event) => { if (event.persisted) loadRack(); });
