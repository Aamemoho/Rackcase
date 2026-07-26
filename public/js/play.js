const title = document.querySelector('#title');
const status = document.querySelector('#status');
const frame = document.querySelector('#frame');
const message = document.querySelector('#message');
const credit = document.querySelector('#credit');

function fail(text) {
  message.hidden = false;
  message.classList.add('error');
  message.textContent = text;
  status.textContent = '슬롯 열기 실패';
}

async function boot() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return fail('카트리지 ID가 없습니다. 랙으로 돌아가 다시 선택해주세요.');
  try {
    const response = await fetch('./data/catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const catalog = await response.json();
    const item = catalog.items.find((entry) => entry.id === id && entry.kind === 'cartridge');
    if (!item) return fail('공개 색인에서 이 카트리지를 찾지 못했습니다.');
    title.textContent = item.title;
    document.title = `${item.title} — aamemoho`;
    status.textContent = `${item.status} · ${item.aiAssisted ? 'AI-assisted' : 'human-made'}`;
    credit.textContent = item.credits || '';
    frame.addEventListener('load', () => { message.hidden = true; }, { once: true });
    frame.src = item.entry;
    setTimeout(() => { if (!message.hidden) message.textContent = '조금 오래 걸리고 있습니다. 연결과 WebGL을 확인하는 중…'; }, 4500);
  } catch (error) {
    console.error(error);
    fail('카트리지 색인을 불러오지 못했습니다.');
  }
}

boot();
