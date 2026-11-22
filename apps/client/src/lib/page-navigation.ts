// Distances are in CSS pixels. A press that moves no further than this is a tap.
export const TAP_MOVE_TOLERANCE_PX = 10;
export const SWIPE_MIN_DISTANCE_PX = 50;
// Horizontal travel must be this many times the vertical travel, so a diagonal
// drift never turns the page.
export const SWIPE_DIRECTION_RATIO = 2;
export const MARGIN_ZONE_REM = 2;

export type PageTurn = 'next' | 'previous';

// A finger moving left drags the page away to reveal the next one, the
// convention of Apple Books and Kindle.
const TURN_FOR_SWIPE_DIRECTION = { left: 'next', right: 'previous' } as const;

export type ViewportRect = { left: number; top: number; right: number; bottom: number };

export type PointerPress = {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
};

export type PointerRelease = {
  pointerId: number;
  x: number;
  y: number;
  // The reading area. A release outside it (over the header, say) never turns the page.
  areaRect: ViewportRect;
  marginWidthPx: number;
};

type PageNavigationOptions = {
  onPreviousPage: () => void;
  onNextPage: () => void;
  // True while an overlay (footnote, image, TOC, explanation) covers the page.
  isBlocked: () => boolean;
  // Closes an open text selection and returns whether there was one.
  dismissSelection: () => boolean;
};

type SwipeTurnOptions = { deltaX: number; deltaY: number };

export function swipeTurn({ deltaX, deltaY }: SwipeTurnOptions): PageTurn | null {
  const horizontalTravel = Math.abs(deltaX);
  if (
    horizontalTravel < SWIPE_MIN_DISTANCE_PX ||
    horizontalTravel < SWIPE_DIRECTION_RATIO * Math.abs(deltaY)
  ) {
    return null;
  }
  return deltaX < 0 ? TURN_FOR_SWIPE_DIRECTION.left : TURN_FOR_SWIPE_DIRECTION.right;
}

type MarginTurnOptions = { x: number; areaRect: ViewportRect; marginWidthPx: number };

export function marginTurn({ x, areaRect, marginWidthPx }: MarginTurnOptions): PageTurn | null {
  if (x < areaRect.left + marginWidthPx) {
    return 'previous';
  }
  if (x > areaRect.right - marginWidthPx) {
    return 'next';
  }
  return null;
}

type IsInsideRectOptions = { x: number; y: number; rect: ViewportRect };

function isInsideRect({ x, y, rect }: IsInsideRectOptions): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Decides whether a press on the reading area is a swipe, a margin tap or
 * neither, and turns the page for it. Holds only the press in progress; the
 * page index itself stays with the caller, which passes the turns in.
 */
export class PageNavigation {
  readonly #onPreviousPage: () => void;
  readonly #onNextPage: () => void;
  readonly #isBlocked: () => boolean;
  readonly #dismissSelection: () => boolean;
  #press: PointerPress | null = null;

  constructor({ onPreviousPage, onNextPage, isBlocked, dismissSelection }: PageNavigationOptions) {
    this.#onPreviousPage = onPreviousPage;
    this.#onNextPage = onNextPage;
    this.#isBlocked = isBlocked;
    this.#dismissSelection = dismissSelection;
  }

  pressStart(press: PointerPress): void {
    // A second finger on the page is a pinch, not a tap. Dropping the press
    // (rather than tracking both) means neither finger's release turns a page.
    if (this.#press) {
      this.#press = null;
      return;
    }
    this.#press = press;
  }

  pressEnd(release: PointerRelease): void {
    const press = this.#press;
    if (!press || press.pointerId !== release.pointerId) {
      return;
    }
    this.#press = null;
    if (
      this.#isBlocked() ||
      !isInsideRect({ x: release.x, y: release.y, rect: release.areaRect })
    ) {
      return;
    }

    const deltaX = release.x - press.x;
    const deltaY = release.y - press.y;
    const isTap =
      Math.abs(deltaX) <= TAP_MOVE_TOLERANCE_PX && Math.abs(deltaY) <= TAP_MOVE_TOLERANCE_PX;
    // A mouse drag is text selection, so a mouse never swipes.
    const swipe = press.pointerType === 'mouse' ? null : swipeTurn({ deltaX, deltaY });
    if (!isTap && swipe === null) {
      return;
    }

    // Closing an open selection takes the gesture: a tap or swipe over the
    // selection must not also turn the page.
    if (this.#dismissSelection()) {
      return;
    }

    const turn = isTap
      ? marginTurn({
          x: release.x,
          areaRect: release.areaRect,
          marginWidthPx: release.marginWidthPx,
        })
      : swipe;
    if (turn === 'next') {
      this.#onNextPage();
    } else if (turn === 'previous') {
      this.#onPreviousPage();
    }
  }

  pressCancel(pointerId: number): void {
    // The browser took the gesture over (it started scrolling), so no page turns.
    if (this.#press?.pointerId === pointerId) {
      this.#press = null;
    }
  }

  // Used when a long-press takes the gesture for a selection, so its release
  // is never read as a tap.
  abandonPress(): void {
    this.#press = null;
  }
}
