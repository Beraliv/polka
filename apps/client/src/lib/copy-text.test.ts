// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copy-text.ts';

type ExecCommandDocument = Document & { execCommand: (command: string) => boolean };

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('copyText', () => {
  it('uses the async Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyText('quick brown')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('quick brown');
  });

  it('falls back to execCommand when the Clipboard API is missing (insecure context)', async () => {
    vi.stubGlobal('navigator', {});
    let copiedValue: string | undefined;
    (document as ExecCommandDocument).execCommand = (command) => {
      const textareaEl = document.querySelector('textarea');
      copiedValue = textareaEl?.value.slice(textareaEl.selectionStart, textareaEl.selectionEnd);
      return command === 'copy';
    };

    expect(await copyText('quick brown')).toBe(true);
    expect(copiedValue).toBe('quick brown');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when the browser refuses execCommand', async () => {
    vi.stubGlobal('navigator', {});
    (document as ExecCommandDocument).execCommand = () => false;

    expect(await copyText('quick brown')).toBe(false);
  });
});
