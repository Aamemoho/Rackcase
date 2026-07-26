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

function card(item, index) {
  const link = document.createElement('a');
  link.className = 'card';
  link.href = item.href;
  link.dataset.kind = item.kind;
  link.style.setProperty('--accent', item.accent || '#9bb8c6');
  if (item.kind === 'external') link.rel = 'external';

  const top = document.createElement('div');
  top.className = 'card-top';
  const n = document.createElement('span');
  n.className = 'card-index';
  n.textContent = `SLOT ${String(index + 1).padStart(2, '0')}`;
  const kind = document.createElement('span');
  kind.className = 'card-slot';
  kind.textContent = kindLabel(item);
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
  const enter = document.createElement('span');
  enter.className = 'enter';
  enter.textContent = enterLabel(item);
  foot.append(enter);

  link.append(top, cartridgeWindow(item), body, foot);
  link.setAttribute('aria-label', `${item.title}: ${item.subtitle}`);
  return link;
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
    grid.replaceChildren(...items.map(card));
    status.textContent = `${String(items.length).padStart(2, '0')} SLOTS · INDEX READY`;
  } catch (error) {
    status.classList.add('error');
    status.textContent = 'INDEX DEGRADED · REMOTE ONLY';
    grid.replaceChildren(card(fallbackItem(), 0));
    console.error(error);
  }
}

loadRack();