const button = document.querySelector('#copy-context');
const context = document.querySelector('#context-plain');
const status = document.querySelector('#copy-status');

button?.addEventListener('click', async () => {
  const text = context?.textContent?.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    status.textContent = '복사됨 · 새 대화에 그대로 붙여넣을 수 있습니다.';
    button.textContent = '복사 완료';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(context);
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = '자동 복사가 막혔습니다 · 선택된 내용을 직접 복사하세요.';
  }
});
