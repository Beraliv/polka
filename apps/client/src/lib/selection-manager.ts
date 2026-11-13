import { copyText } from './copy-text.ts';
import { offsetFromPoint, rangeFromOffsets, wordBoundsAtOffset } from './text-offsets.ts';

const WEB_SEARCH_URL = 'https://www.google.com/search?q=';

// A selection in progress, stored as combined-text offsets into one rendered
// paragraph rather than a live Range — Ranges go stale the moment the page
// they belong to unmounts, but offsets can be re-resolved against
// paragraphEl on demand. Confined to a single paragraph: dragging a handle
// clamps to its bounds.
export type ActiveSelection = {
  paragraphEl: HTMLElement;
  startOffset: number;
  endOffset: number;
};

export type SelectionListener = (selection: ActiveSelection | null) => void;

type TrackPointerOptions = {
  pointerId: number;
  onPoint: (clientX: number, clientY: number) => void;
};

function paragraphAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const target = document.elementFromPoint(clientX, clientY);
  return target instanceof HTMLElement ? target.closest<HTMLElement>('.reader-paragraph') : null;
}

/**
 * Owns the reader's custom text selection: starting it (long-press or
 * double-click on a word, or a mouse press-and-drag), adjusting it by
 * dragging its handles, and the actions run on it. Plain DOM
 * and no UI framework — a framework binds to it through `subscribe` (see
 * create-selection-manager.ts for the Solid one). One instance per reader
 * mount, not a shared module-level store.
 */
export class SelectionManager {
  #currentSelection: ActiveSelection | null = null;
  // Cached per selection change so the overlay, handles and toolbar all
  // share one Range instead of each re-walking the paragraph's text nodes.
  #currentRange: Range | null = null;
  readonly #listeners = new Set<SelectionListener>();

  get selection(): ActiveSelection | null {
    return this.#currentSelection;
  }

  get range(): Range | null {
    return this.#currentRange;
  }

  /** Calls `listener` on every selection change; returns an unsubscribe function. */
  subscribe(listener: SelectionListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dismissSelection(): void {
    this.#setSelection(null);
  }

  /** Selects the word at a viewport point; used by long-press and double-click. */
  selectWordAtPoint(clientX: number, clientY: number): void {
    const paragraphEl = paragraphAtPoint(clientX, clientY);
    if (!paragraphEl) {
      return;
    }
    const offset = offsetFromPoint(paragraphEl, clientX, clientY);
    if (offset === null) {
      return;
    }
    const [start, end] = wordBoundsAtOffset(paragraphEl.textContent ?? '', offset);
    if (start === end) {
      // Pressed on whitespace or punctuation, not a word — nothing to select.
      return;
    }
    this.#setSelection({ paragraphEl, startOffset: start, endOffset: end });
  }

  /**
   * Mouse selection: pressing on a paragraph and dragging selects from the
   * press point to the pointer, character by character, like native
   * selection. Any press also dismisses the open selection, the mouse
   * counterpart of tapping elsewhere. Touch and pen are ignored — on touch
   * screens a press-and-drag is a swipe, so selection starts from a
   * long-press there instead.
   */
  selectByPointerDrag(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }
    this.#setSelection(null);
    const paragraphEl = paragraphAtPoint(event.clientX, event.clientY);
    if (!paragraphEl) {
      return;
    }
    const anchorOffset = offsetFromPoint(paragraphEl, event.clientX, event.clientY);
    if (anchorOffset === null) {
      return;
    }
    this.#trackPointer({
      pointerId: event.pointerId,
      onPoint: (clientX, clientY) => {
        const offset = offsetFromPoint(paragraphEl, clientX, clientY);
        // Back on the anchor, the last non-empty selection is kept rather
        // than collapsing to nothing mid-drag.
        if (offset === null || offset === anchorOffset) {
          return;
        }
        const startOffset = Math.min(anchorOffset, offset);
        const endOffset = Math.max(anchorOffset, offset);
        const previous = this.#currentSelection;
        if (previous?.startOffset === startOffset && previous.endOffset === endOffset) {
          return;
        }
        this.#setSelection({ paragraphEl, startOffset, endOffset });
      },
    });
  }

  dragHandle(edge: 'start' | 'end', event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const selectionAtStart = this.#currentSelection;
    if (!selectionAtStart) {
      return;
    }
    const { paragraphEl } = selectionAtStart;
    const pointerId = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(pointerId);

    // Handles render at the bottom of their line (see SelectionOverlay), so a
    // pointer following one sits right at the boundary with the next line —
    // any natural drag motion tips the raw Y into that next line's hit-test
    // zone. Sampling from mid-line instead keeps horizontal drags resolving
    // within the line the handle actually represents.
    const lineHeightPx = parseFloat(getComputedStyle(paragraphEl).lineHeight);
    const sampleYOffset = Number.isNaN(lineHeightPx) ? 0 : lineHeightPx / 2;

    this.#trackPointer({
      pointerId,
      onPoint: (clientX, clientY) => {
        const offset = offsetFromPoint(paragraphEl, clientX, clientY - sampleYOffset);
        const previous = this.#currentSelection;
        if (offset === null || !previous) {
          return;
        }
        const nextStart =
          edge === 'start' ? Math.min(offset, previous.endOffset - 1) : previous.startOffset;
        const nextEnd =
          edge === 'end' ? Math.max(offset, previous.startOffset + 1) : previous.endOffset;
        // Skipping unchanged offsets keeps subscribers from being notified, so a
        // pointer jittering within one character re-renders nothing.
        if (nextStart === previous.startOffset && nextEnd === previous.endOffset) {
          return;
        }
        this.#setSelection({ ...previous, startOffset: nextStart, endOffset: nextEnd });
      },
    });
  }

  async copyActiveSelection(): Promise<void> {
    const text = this.#selectionText();
    if (text) {
      try {
        const copied = await copyText(text);
        if (!copied) {
          console.error('[SelectionManager] The browser refused to copy the selection');
        }
      } catch (error) {
        console.error('[SelectionManager] Failed to copy selection to clipboard:', error);
      }
    }
    this.#setSelection(null);
  }

  searchActiveSelectionInWeb(): void {
    const text = this.#selectionText().trim();
    if (text) {
      window.open(`${WEB_SEARCH_URL}${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
    this.#setSelection(null);
  }

  /**
   * Follows one pointer until it's released, calling `onPoint` with its
   * latest position at most once per frame. Pointer moves arrive far more
   * often than frames are painted, and each hit-test walks the paragraph's
   * text nodes, so only the latest position per frame is worth handling.
   */
  #trackPointer({ pointerId, onPoint }: TrackPointerOptions): void {
    let pendingPoint: { clientX: number; clientY: number } | null = null;
    let frameId: number | undefined;

    const applyPendingPoint = () => {
      frameId = undefined;
      if (!pendingPoint) {
        return;
      }
      const { clientX, clientY } = pendingPoint;
      pendingPoint = null;
      onPoint(clientX, clientY);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      pendingPoint = { clientX: moveEvent.clientX, clientY: moveEvent.clientY };
      frameId ??= requestAnimationFrame(applyPendingPoint);
    };

    const handleEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        applyPendingPoint();
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };

    // Listening on window rather than the pressed element keeps the drag
    // alive even if that element is re-created mid-gesture (as a selection
    // handle can be), and lets a mouse drag continue past the paragraph.
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  }

  #selectionText(): string {
    return this.#currentRange?.toString() ?? '';
  }

  #setSelection(next: ActiveSelection | null): void {
    if (next === this.#currentSelection) {
      return;
    }
    this.#currentSelection = next;
    this.#currentRange = next
      ? rangeFromOffsets(next.paragraphEl, next.startOffset, next.endOffset)
      : null;
    for (const listener of this.#listeners) {
      listener(next);
    }
  }
}
