// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionManager } from './selection-manager.ts';

type CaretDocument = Document & { caretRangeFromPoint?: (x: number, y: number) => Range };

function buildParagraphEl(text: string): HTMLElement {
  const paragraphEl = document.createElement('p');
  paragraphEl.className = 'reader-paragraph';
  paragraphEl.textContent = text;
  document.body.appendChild(paragraphEl);
  return paragraphEl;
}

// jsdom has no layout, so hit-testing is stubbed to land `offset` characters
// into paragraphEl's single text node.
function stubPointAt({ paragraphEl, offset }: { paragraphEl: HTMLElement; offset: number }) {
  const caretRange = document.createRange();
  caretRange.setStart(paragraphEl.firstChild!, offset);
  document.elementFromPoint = () => paragraphEl;
  (document as CaretDocument).caretRangeFromPoint = () => caretRange;
}

// Hit-testing is stubbed so a point's X coordinate is its character offset
// into paragraphEl's single text node.
function stubOffsetsFromX(paragraphEl: HTMLElement) {
  document.elementFromPoint = () => paragraphEl;
  (document as CaretDocument).caretRangeFromPoint = (x) => {
    const caretRange = document.createRange();
    caretRange.setStart(paragraphEl.firstChild!, x);
    return caretRange;
  };
}

type PointerInit = { type: string; clientX: number; pointerType?: string; button?: number };

// jsdom doesn't implement PointerEvent, so a MouseEvent gets the pointer
// fields the manager reads.
function createPointerEvent({ type, clientX, pointerType = 'mouse', button = 0 }: PointerInit) {
  const event = new MouseEvent(type, { clientX, clientY: 0, button });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  return event as PointerEvent;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('SelectionManager', () => {
  it('selects the word under the point and notifies subscribers', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubPointAt({ paragraphEl, offset: 6 });
    const manager = new SelectionManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.selectWordAtPoint(0, 0);

    expect(manager.range?.toString()).toBe('quick');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(manager.selection);
  });

  it('ignores a point on whitespace', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubPointAt({ paragraphEl, offset: 3 });
    const manager = new SelectionManager();

    manager.selectWordAtPoint(0, 0);

    expect(manager.selection).toBeNull();
  });

  it('does not notify when dismissing an already empty selection', () => {
    const manager = new SelectionManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.dismissSelection();

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubPointAt({ paragraphEl, offset: 6 });
    const manager = new SelectionManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    unsubscribe();
    manager.selectWordAtPoint(0, 0);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('SelectionManager.selectByPointerDrag', () => {
  it('selects from the press point to the release point with a mouse', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 4 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 15 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 15 }));

    expect(manager.range?.toString()).toBe('quick brown');
  });

  it('selects backwards when dragged before the press point', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 15 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 10 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 10 }));

    expect(manager.range?.toString()).toBe('brown');
  });

  it('applies at most one move per animation frame', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();
    const listener = vi.fn();
    manager.subscribe(listener);

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 4 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 6 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 9 }));
    vi.advanceTimersToNextFrame();

    expect(listener).toHaveBeenCalledOnce();
    expect(manager.range?.toString()).toBe('quick');
  });

  it('does not select on a plain click', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 4 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 4 }));

    expect(manager.selection).toBeNull();
  });

  it('dismisses the open selection on a new press', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();
    manager.selectWordAtPoint(6, 0);

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 4 }));

    expect(manager.selection).toBeNull();
  });

  it('ignores touch, which selects through long-press instead', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(
      createPointerEvent({ type: 'pointerdown', clientX: 4, pointerType: 'touch' }),
    );
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 15 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 15 }));

    expect(manager.selection).toBeNull();
  });
});
