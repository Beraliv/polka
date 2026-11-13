import { copyText } from './copy-text.ts';
import {
  comparePositions,
  positionFromPoint,
  rangeBetween,
  textBetween,
  wordBoundsAtOffset,
} from './text-offsets.ts';
import type { TextPosition } from './text-offsets.ts';

const WEB_SEARCH_URL = 'https://www.google.com/search?q=';

// The selected text from `start` to `end` (exclusive), in reading order. The
// two positions may be in different paragraphs anywhere on the visible
// page(s), and `start` always comes before `end`.
export type ActiveSelection = { start: TextPosition; end: TextPosition };

export type SelectionListener = (selection: ActiveSelection | null) => void;

type TrackPointerOptions = {
  pointerId: number;
  onPoint: (clientX: number, clientY: number) => void;
};

function isSamePosition(first: TextPosition, second: TextPosition): boolean {
  return first.paragraphEl === second.paragraphEl && first.offset === second.offset;
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
  // share one Range instead of each re-walking the paragraphs' text nodes.
  #currentRange: Range | null = null;
  readonly #listeners = new Set<SelectionListener>();
  // `dblclick` is a MouseEvent without a pointerType, so whether a double
  // click came from a mouse is read off the press that preceded it.
  #lastPressWasMouse = false;

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

  /** Selects the word at a viewport point; used by long-press and mouse double-click. */
  selectWordAtPoint(clientX: number, clientY: number): void {
    const position = positionFromPoint(clientX, clientY);
    if (!position) {
      return;
    }
    const { paragraphEl } = position;
    const [start, end] = wordBoundsAtOffset(paragraphEl.textContent ?? '', position.offset);
    if (start === end) {
      // Pressed on whitespace or punctuation, not a word — nothing to select.
      return;
    }
    this.#setSelection({
      start: { paragraphEl, offset: start },
      end: { paragraphEl, offset: end },
    });
  }

  /**
   * Mouse double-click selects the word under the pointer. Ignored for touch:
   * mobile browsers can fire `dblclick` on a double-tap, and touch selection
   * starts from a long-press instead.
   */
  selectWordOnDoubleClick(event: MouseEvent): void {
    if (!this.#lastPressWasMouse) {
      return;
    }
    this.selectWordAtPoint(event.clientX, event.clientY);
  }

  /**
   * Mouse selection: pressing on text and dragging selects from the press
   * point to the pointer, character by character and across paragraphs, like
   * native selection. Any press also dismisses the open selection, the mouse
   * counterpart of tapping elsewhere. Touch and pen are ignored — on touch
   * screens a press-and-drag is a swipe, so selection starts from a
   * long-press there instead.
   */
  selectByPointerDrag(event: PointerEvent): void {
    this.#lastPressWasMouse = event.pointerType === 'mouse';
    if (event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }
    this.#setSelection(null);
    const anchor = positionFromPoint(event.clientX, event.clientY);
    if (!anchor) {
      return;
    }
    this.#trackPointer({
      pointerId: event.pointerId,
      onPoint: (clientX, clientY) => {
        const focus = positionFromPoint(clientX, clientY);
        // Off the text (margins, between paragraphs) the selection keeps its
        // last extent; back on the anchor it keeps the last non-empty one
        // rather than collapsing to nothing mid-drag.
        if (!focus) {
          return;
        }
        const order = comparePositions(anchor, focus);
        if (order === 0) {
          return;
        }
        const next = order < 0 ? { start: anchor, end: focus } : { start: focus, end: anchor };
        const previous = this.#currentSelection;
        if (
          previous &&
          isSamePosition(previous.start, next.start) &&
          isSamePosition(previous.end, next.end)
        ) {
          return;
        }
        this.#setSelection(next);
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
    const pointerId = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(pointerId);

    // Handles render at the bottom of their line (see SelectionOverlay), so a
    // pointer following one sits right at the boundary with the next line —
    // any natural drag motion tips the raw Y into that next line's hit-test
    // zone. Sampling from mid-line instead keeps horizontal drags resolving
    // within the line the handle actually represents.
    const lineHeightPx = parseFloat(
      getComputedStyle(selectionAtStart[edge].paragraphEl).lineHeight,
    );
    const sampleYOffset = Number.isNaN(lineHeightPx) ? 0 : lineHeightPx / 2;

    this.#trackPointer({
      pointerId,
      onPoint: (clientX, clientY) => {
        const position = positionFromPoint(clientX, clientY - sampleYOffset);
        const previous = this.#currentSelection;
        if (!position || !previous) {
          return;
        }
        // Skipping an unchanged position keeps subscribers from being
        // notified, so a pointer jittering within one character re-renders
        // nothing.
        if (isSamePosition(position, previous[edge])) {
          return;
        }
        // An end can't be dragged onto or past the other; the selection
        // stays at its last valid extent until the pointer comes back.
        const isBeforeEnd = comparePositions(position, previous.end) < 0;
        const isAfterStart = comparePositions(position, previous.start) > 0;
        if (edge === 'start' ? !isBeforeEnd : !isAfterStart) {
          return;
        }
        this.#setSelection({ ...previous, [edge]: position });
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
        // A cancelled gesture (the browser took it over) shouldn't move the
        // selection; only a real release applies the last position.
        if (endEvent.type === 'pointerup') {
          applyPendingPoint();
        }
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };

    // Listening on window rather than the pressed element keeps the drag
    // alive even if that element is re-created mid-gesture (as a selection
    // handle can be), and lets a mouse drag continue over other paragraphs.
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  }

  #selectionText(): string {
    const current = this.#currentSelection;
    return current ? textBetween(current.start, current.end) : '';
  }

  #setSelection(next: ActiveSelection | null): void {
    if (next === this.#currentSelection) {
      return;
    }
    this.#currentSelection = next;
    this.#currentRange = next ? rangeBetween(next.start, next.end) : null;
    for (const listener of this.#listeners) {
      listener(next);
    }
  }
}
