/**
 * Copies `text` to the clipboard, returning whether it succeeded.
 *
 * The async Clipboard API only exists in secure contexts (HTTPS or
 * localhost), but the app is typically served over plain HTTP on the NAS
 * (see docs/truenas.md), where `navigator.clipboard` is undefined. There the
 * deprecated `execCommand('copy')` is the only way left, and it still works
 * in every browser when called from a user gesture.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return copyTextWithExecCommand(text);
}

function copyTextWithExecCommand(text: string): boolean {
  const textareaEl = document.createElement('textarea');
  textareaEl.value = text;
  // readonly keeps iOS from opening the keyboard on focus; 16px stops iOS
  // from zooming into the field; fixed off-screen keeps it from scrolling the
  // page or being seen.
  textareaEl.readOnly = true;
  textareaEl.style.position = 'fixed';
  textareaEl.style.top = '0';
  textareaEl.style.left = '-9999px';
  textareaEl.style.fontSize = '16px';
  document.body.appendChild(textareaEl);
  try {
    textareaEl.select();
    // iOS ignores select() on a readonly field; an explicit range is needed.
    textareaEl.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } finally {
    textareaEl.remove();
  }
}
