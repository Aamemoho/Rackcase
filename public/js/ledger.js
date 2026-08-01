// 랙 원장(ledger).
//
// 규칙 하나만 지키면 이 구조는 계속 늘어난다:
//   지불(spent)은 되돌릴 수 없는 선택만 기록한다. 방문(seen)은 지불이 아니다.
//
// 잠금 조건은 "지불했는가"만 본다. "무엇을 골랐는가"는 절대 잠금에 쓰지 않는다.
// 고른 내용은 carry — 다음 세계의 문장 — 에만 반영된다.
// 이걸 섞는 순간 주제가 벌칙이 되고, 사람은 주제 대신 공략을 읽는다.

const KEY = 'rack:ledger:v1';
const EMPTY = { version: 1, spent: {}, seen: {} };

function safeStorage() {
  try {
    const probe = '__rack_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

const storage = safeStorage();
let memory = null;

export function readLedger() {
  let raw = memory;
  if (storage) {
    try { raw = storage.getItem(KEY) ?? memory; } catch { /* 메모리 fallback 유지 */ }
  }
  if (!raw) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      spent: parsed.spent && typeof parsed.spent === 'object' ? parsed.spent : {},
      seen: parsed.seen && typeof parsed.seen === 'object' ? parsed.seen : {}
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function writeLedger(ledger) {
  const raw = JSON.stringify(ledger);
  if (storage) {
    try { storage.setItem(KEY, raw); return; } catch { /* 아래로 */ }
  }
  memory = raw;
}

// 지불. 이미 지불된 슬롯은 다시 쓰지 않는다 — 그게 되돌릴 수 없다는 뜻이다.
export function spend(id, choice) {
  const ledger = readLedger();
  if (ledger.spent[id]) return ledger;
  ledger.spent[id] = { choice, at: new Date().toISOString() };
  writeLedger(ledger);
  return ledger;
}

// 방문. 몇 번이든 갱신되고, 잠금에는 관여하지 않는다.
export function see(id) {
  const ledger = readLedger();
  ledger.seen[id] = new Date().toISOString();
  writeLedger(ledger);
  return ledger;
}

export function choiceOf(ledger, id) {
  return ledger.spent[id]?.choice ?? null;
}

export function clearLedger() {
  if (storage) { try { storage.removeItem(KEY); } catch { /* noop */ } }
  memory = null;
}

// requires 평가.
//   requires.spent: [id, ...]  → 전부 지불되어 있어야 함 (AND)
//   requires.anyOf: [id, ...]  → 하나만 지불되어 있으면 됨 (OR)
// 슬롯이 옆으로 늘어나도 이 두 가지 조합으로 대부분 표현된다.
export function isUnlocked(item, ledger) {
  const requires = item.requires;
  if (!requires) return true;

  const all = Array.isArray(requires.spent) ? requires.spent : [];
  if (all.some((id) => !ledger.spent[id])) return false;

  const any = Array.isArray(requires.anyOf) ? requires.anyOf : [];
  if (any.length > 0 && !any.some((id) => ledger.spent[id])) return false;

  return true;
}

// carry 합성.
//
// 지불 지점이 둘이면 상태는 3×3 = 9가지지만, 9개를 적을 필요는 없다.
// 규칙을 순서대로 얹으면 3+3으로 9가 나온다. 뒤에 온 규칙이 앞을 덮는다.
// 지불 지점이 셋이 되면 3+3+3으로 27가지가 되고, 적는 양은 그대로 선형이다.
export function resolveCarry(item, ledger) {
  const rules = Array.isArray(item.carry) ? item.carry : item.carry ? [item.carry] : [];
  let resolved = { ...item };

  for (const rule of rules) {
    const choice = choiceOf(ledger, rule.from);
    if (!choice) continue;
    const patch = rule.byChoice?.[choice];
    if (patch) resolved = { ...resolved, ...patch };
  }

  return resolved;
}

// 잠긴 슬롯도 카드로는 존재한다. 숨기지 않는다 —
// 없는 것과 아직 못 여는 것은 다르다.
export function lockedView(item) {
  const locked = item.locked || {};
  return {
    ...item,
    title: locked.title || '봉인된 슬롯',
    subtitle: locked.subtitle || '앞선 슬롯에서 선택을 지불해야 열립니다.',
    status: 'sealed',
    href: null
  };
}
