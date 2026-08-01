const title = document.querySelector('#title');
const status = document.querySelector('#status');
const frame = document.querySelector('#frame');
const message = document.querySelector('#message');
const credit = document.querySelector('#credit');
const launch = document.querySelector('#launch');
const launchButton = document.querySelector('#launchButton');
const launchTitle = document.querySelector('#launchTitle');
const launchCopy = document.querySelector('#launchCopy');
const rotate = document.querySelector('#rotate');
const fullscreenButton = document.querySelector('#fullscreen');

const coarsePointer = matchMedia('(pointer: coarse)').matches;
const touchDevice = coarsePointer || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window);
const saveKeyPattern = /^photogenesis-0f1-save-v1-\d+$/;
let immersiveLandscape = false;
let started = false;
let hasEnteredFullscreen = false;
let currentItemId = null;

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

function canFullscreen() {
  return typeof document.documentElement.requestFullscreen === 'function';
}

function setLaunchCopy(resume) {
  launchTitle.textContent = resume ? '가로 전체화면으로 다시 시작' : '가로 전체화면으로 시작';
  launchCopy.textContent = resume
    ? '전체화면을 나왔습니다. 촬영과 세계 변화는 그대로 저장되어 있습니다.'
    : '주소창과 세로 압축을 피하고, 양쪽 조작 영역을 모두 보이게 합니다.';
  launchButton.textContent = resume ? '가로 전체화면 다시 시작' : '가로 전체화면 시작';
}

function updateFullscreenControl() {
  const resumeGateVisible = immersiveLandscape && touchDevice && started && !launch.hidden;
  fullscreenButton.hidden = !immersiveLandscape || !started || !canFullscreen()
    || Boolean(document.fullscreenElement) || resumeGateVisible;
}

function updateLaunchGate() {
  if (!immersiveLandscape || !touchDevice) return;
  if (!started) {
    setLaunchCopy(false);
    launch.hidden = false;
  } else {
    const needsResume = canFullscreen() && hasEnteredFullscreen && !document.fullscreenElement;
    setLaunchCopy(needsResume);
    launch.hidden = !needsResume;
  }
  updateFullscreenControl();
}

function updateOrientationGate() {
  const blocked = immersiveLandscape && touchDevice && started && isPortrait() && launch.hidden;
  document.body.classList.toggle('orientation-blocked', blocked);
  rotate.hidden = !blocked;
  frame.setAttribute('aria-hidden', String(blocked));
}

async function requestImmersiveMode() {
  if (!document.fullscreenElement && canFullscreen()) {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      hasEnteredFullscreen = Boolean(document.fullscreenElement);
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
  updateLaunchGate();
  updateOrientationGate();
  updateFullscreenControl();
  if (!document.body.classList.contains('orientation-blocked') && launch.hidden) frame.focus();
}

function configurePresentation(item) {
  immersiveLandscape = item.presentation?.mode === 'immersive-landscape';
  if (!immersiveLandscape) return;

  document.body.classList.add('immersive', 'landscape-required');
  if (touchDevice) {
    setLaunchCopy(false);
    launch.hidden = false;
  } else {
    started = true;
    document.body.classList.add('started');
  }
  updateOrientationGate();
  updateFullscreenControl();
}

function validSaveKey(key) {
  return currentItemId === 'photogenesis' && typeof key === 'string' && saveKeyPattern.test(key);
}

function sendSaveReply(type, body = {}) {
  if (!frame.contentWindow) return;
  frame.contentWindow.postMessage({ type, ...body }, '*');
}

addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || !validSaveKey(data.key)) return;

  if (data.type === 'aamemoho:save-load') {
    try {
      const raw = localStorage.getItem(data.key);
      document.documentElement.dataset.photogenesisSave = raw ? 'loaded' : 'empty';
      sendSaveReply('aamemoho:save-data', {
        key: data.key,
        payload: raw ? JSON.parse(raw) : null
      });
    } catch (error) {
      document.documentElement.dataset.photogenesisSave = 'read-error';
      console.warn('Photogenesis save could not be read.', error);
      sendSaveReply('aamemoho:save-data', { key: data.key, payload: null, error: true });
    }
  }

  if (data.type === 'aamemoho:save-write') {
    let compact = false;
    try {
      localStorage.setItem(data.key, JSON.stringify(data.payload));
    } catch (error) {
      try {
        localStorage.setItem(data.key, JSON.stringify(data.compactPayload));
        compact = true;
      } catch (compactError) {
        console.warn('Photogenesis save could not be written.', compactError);
        sendSaveReply('aamemoho:save-status', { key: data.key, ok: false });
        return;
      }
    }
    document.documentElement.dataset.photogenesisSave = compact ? 'written-compact' : 'written';
    sendSaveReply('aamemoho:save-status', { key: data.key, ok: true, compact });
  }
});

async function boot() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return fail('카트리지 ID가 없습니다. 랙으로 돌아가 다시 선택해주세요.');
  try {
    const response = await fetch('./data/catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const catalog = await response.json();
    const item = catalog.items.find((entry) => entry.id === id && entry.kind === 'cartridge');
    if (!item) return fail('공개 색인에서 이 카트리지를 찾지 못했습니다.');

    currentItemId = item.id;
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
  updateLaunchGate();
  updateOrientationGate();
  updateFullscreenControl();
});
addEventListener('resize', () => {
  updateLaunchGate();
  updateOrientationGate();
});
addEventListener('orientationchange', () => {
  updateLaunchGate();
  updateOrientationGate();
});
addEventListener('pageshow', () => {
  updateLaunchGate();
  updateOrientationGate();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateLaunchGate();
    updateOrientationGate();
  }
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) hasEnteredFullscreen = true;
  updateLaunchGate();
  updateOrientationGate();
  updateFullscreenControl();
});

boot();
