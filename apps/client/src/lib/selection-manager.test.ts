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
  (document as CaretDocument).caretRangeFromPoint = () => caretRange;
}

// Hit-testing is stubbed so a point's X coordinate is its character offset
// into paragraphEl's single text node.
function stubOffsetsFromX(paragraphEl: HTMLElement) {
  (document as CaretDocument).caretRangeFromPoint = (x) => {
    const caretRange = document.createRange();
    caretRange.setStart(paragraphEl.firstChild!, x);
    return caretRange;
  };
}

type PointerInit = {
  type: string;
  clientX: number;
  clientY?: number;
  pointerType?: string;
  button?: number;
};

// jsdom doesn't implement PointerEvent, so a MouseEvent gets the pointer
// fields the manager reads.
function createPointerEvent({
  type,
  clientX,
  clientY = 0,
  pointerType = 'mouse',
  button = 0,
}: PointerInit) {
  const event = new MouseEvent(type, { clientX, clientY, button });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  return event as PointerEvent;
}

// Several paragraphs: a point's Y picks the paragraph (by index) and its X
// is the character offset into that paragraph.
function stubPositionsFromPoint(paragraphEls: HTMLElement[]) {
  (document as CaretDocument).caretRangeFromPoint = (x, y) => {
    const caretRange = document.createRange();
    caretRange.setStart(paragraphEls[y]!.firstChild!, x);
    return caretRange;
  };
}

function createHandleDragEvent(clientX: number): PointerEvent {
  const handleEl = document.createElement('div');
  handleEl.setPointerCapture = () => {};
  const event = createPointerEvent({ type: 'pointerdown', clientX });
  Object.defineProperty(event, 'currentTarget', { value: handleEl });
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

describe('SelectionManager.selectWordOnDoubleClick', () => {
  it('selects the word after a mouse press', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 6 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 6 }));
    manager.selectWordOnDoubleClick(new MouseEvent('dblclick', { clientX: 6 }));

    expect(manager.range?.toString()).toBe('quick');
  });

  it('ignores a double-tap on a touch screen', () => {
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(
      createPointerEvent({ type: 'pointerdown', clientX: 6, pointerType: 'touch' }),
    );
    manager.selectWordOnDoubleClick(new MouseEvent('dblclick', { clientX: 6 }));

    expect(manager.selection).toBeNull();
  });
});

describe('SelectionManager pointer tracking', () => {
  it('drops the pending move when the gesture is cancelled', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const paragraphEl = buildParagraphEl('The quick brown fox');
    stubOffsetsFromX(paragraphEl);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(createPointerEvent({ type: 'pointerdown', clientX: 4 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 9 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointercancel', clientX: 9 }));
    vi.advanceTimersToNextFrame();

    expect(manager.selection).toBeNull();
  });
});

describe('SelectionManager across paragraphs', () => {
  it('extends a mouse drag into the following paragraphs', () => {
    const paragraphEls = [
      buildParagraphEl('First paragraph.'),
      buildParagraphEl('Second one.'),
      buildParagraphEl('Third.'),
    ];
    stubPositionsFromPoint(paragraphEls);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(
      createPointerEvent({ type: 'pointerdown', clientX: 6, clientY: 0 }),
    );
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 5, clientY: 2 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 5, clientY: 2 }));

    expect(manager.range?.toString()).toBe('paragraph.Second one.Third');
  });

  it('extends a mouse drag backwards into a previous paragraph', () => {
    const paragraphEls = [buildParagraphEl('First paragraph.'), buildParagraphEl('Second one.')];
    stubPositionsFromPoint(paragraphEls);
    const manager = new SelectionManager();

    manager.selectByPointerDrag(
      createPointerEvent({ type: 'pointerdown', clientX: 6, clientY: 1 }),
    );
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 6, clientY: 0 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 6, clientY: 0 }));

    expect(manager.selection?.start).toEqual({ paragraphEl: paragraphEls[0], offset: 6 });
    expect(manager.selection?.end).toEqual({ paragraphEl: paragraphEls[1], offset: 6 });
  });

  it('drags the end handle into the next paragraph', () => {
    const paragraphEls = [buildParagraphEl('First paragraph.'), buildParagraphEl('Second one.')];
    stubPositionsFromPoint(paragraphEls);
    const manager = new SelectionManager();
    manager.selectWordAtPoint(1, 0);

    manager.dragHandle('end', createHandleDragEvent(5));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 6, clientY: 1 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 6, clientY: 1 }));

    expect(manager.range?.toString()).toBe('First paragraph.Second');
  });

  it('keeps the start handle from passing the end', () => {
    const paragraphEls = [buildParagraphEl('First paragraph.'), buildParagraphEl('Second one.')];
    stubPositionsFromPoint(paragraphEls);
    const manager = new SelectionManager();
    manager.selectWordAtPoint(1, 0);
    const selectionBefore = manager.selection;

    manager.dragHandle('start', createHandleDragEvent(0));
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 3, clientY: 1 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 3, clientY: 1 }));

    expect(manager.selection).toBe(selectionBefore);
  });

  it('copies paragraphs separated by newlines', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const paragraphEls = [buildParagraphEl('First paragraph.'), buildParagraphEl('Second one.')];
    stubPositionsFromPoint(paragraphEls);
    const manager = new SelectionManager();
    manager.selectByPointerDrag(
      createPointerEvent({ type: 'pointerdown', clientX: 6, clientY: 0 }),
    );
    window.dispatchEvent(createPointerEvent({ type: 'pointermove', clientX: 6, clientY: 1 }));
    window.dispatchEvent(createPointerEvent({ type: 'pointerup', clientX: 6, clientY: 1 }));

    await manager.copyActiveSelection();

    expect(writeText).toHaveBeenCalledWith('paragraph.\nSecond');
  });
});
