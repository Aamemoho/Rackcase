const title = document.querySelector('#title');
const status = document.querySelector('#status');
const frame = document.querySelector('#frame');
const message = document.querySelector('#message');
const credit = document.querySelector('#credit');
const launch = document.querySelector('#launch');
const launchButton = document.querySelector('#launchButton');
const rotate = document.querySelector('#rotate');
const fullscreenButton = document.querySelector('#fullscreen');

const coarsePointer = matchMedia('(pointer: coarse)').matches;
const touchDevice = coarsePointer || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window);
let immersiveLandscape = false;
let started = false;

function fail(text) {
  message.hidden = false;
  message.classList.add('error');
  message.textContent = text;
  status.textContent = '슬롯 열기 실패';
  launch.hidden = true;
  rotate.hidden = true;
  fullscreenButton.hidden = true;
}

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

function updateFullscreenControl() {
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
  fullscreenButton.hidden = !immersiveLandscape || !started || !canFullscreen || Boolean(document.fullscreenElement);
}

function updateOrientationGate() {
  const blocked = immersiveLandscape && touchDevice && started && isPortrait();
  document.body.classList.toggle('orientation-blocked', blocked);
  rotate.hidden = !blocked;
  frame.setAttribute('aria-hidden', String(blocked));
}

async function requestImmersiveMode() {
  if (!document.fullscreenElement && typeof document.documentElement.requestFullscreen === 'function') {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (error) {
      console.info('Fullscreen is unavailable in this browser; using the dynamic viewport instead.', error);
    }
  }

  if (screen.orientation && typeof screen.orientation.lock === 'function') {
    try {
      await screen.orientation.lock('landscape');
    } catch (error) {
      console.info('Landscape lock is unavailable; waiting for manual rotation.', error);
    }
  }
}

async function startImmersive() {
  started = true;
  document.body.classList.add('started');
  launch.hidden = true;
  await requestImmersiveMode();
  updateOrientationGate();
  updateFullscreenControl();
  if (!document.body.classList.contains('orientation-blocked')) frame.focus();
}

function configurePresentation(item) {
  immersiveLandscape = item.presentation?.mode === 'immersive-landscape';
  if (!immersiveLandscape) return;

  document.body.classList.add('immersive', 'landscape-required');
  if (touchDevice) {
    launch.hidden = false;
  } else {
    started = true;
    document.body.classList.add('started');
  }
  updateOrientationGate();
  updateFullscreenControl();
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
    configurePresentation(item);

    frame.addEventListener('load', () => { message.hidden = true; }, { once: true });
    frame.src = item.entry;
    setTimeout(() => {
      if (!message.hidden) message.textContent = '조금 오래 걸리고 있습니다. 연결과 WebGL을 확인하는 중…';
    }, 4500);
  } catch (error) {
    console.error(error);
    fail('카트리지 색인을 불러오지 못했습니다.');
  }
}

launchButton.addEventListener('click', startImmersive);
fullscreenButton.addEventListener('click', async () => {
  await requestImmersiveMode();
  updateOrientationGate();
  updateFullscreenControl();
});
addEventListener('resize', updateOrientationGate);
addEventListener('orientationchange', updateOrientationGate);
document.addEventListener('fullscreenchange', () => {
  updateOrientationGate();
  updateFullscreenControl();
});

boot();
