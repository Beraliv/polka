import { describe, expect, it, vi } from 'vitest';
import {
  MARGIN_ZONE_REM,
  PageNavigation,
  SWIPE_MIN_DISTANCE_PX,
  marginTurn,
  swipeTurn,
} from './page-navigation.ts';
import type { PointerRelease, ViewportRect } from './page-navigation.ts';

const AREA_RECT: ViewportRect = { left: 0, top: 50, right: 800, bottom: 600 };
const MARGIN_PX = MARGIN_ZONE_REM * 16;
const MIDDLE_X = 400;
const MIDDLE_Y = 300;

function buildNavigation({ isBlocked = false, selectionOpen = false } = {}) {
  const onPreviousPage = vi.fn();
  const onNextPage = vi.fn();
  let selection = selectionOpen;
  const navigation = new PageNavigation({
    onPreviousPage,
    onNextPage,
    isBlocked: () => isBlocked,
    dismissSelection: () => {
      const wasOpen = selection;
      selection = false;
      return wasOpen;
    },
  });
  return { navigation, onPreviousPage, onNextPage };
}

function release(overrides: Partial<PointerRelease>): PointerRelease {
  return {
    pointerId: 1,
    x: MIDDLE_X,
    y: MIDDLE_Y,
    areaRect: AREA_RECT,
    marginWidthPx: MARGIN_PX,
    ...overrides,
  };
}

// Presses on the middle of the page unless a test moves them.
function press(
  navigation: PageNavigation,
  overrides: { x?: number; y?: number; pointerType?: string; pointerId?: number } = {},
) {
  navigation.pressStart({
    pointerId: overrides.pointerId ?? 1,
    pointerType: overrides.pointerType ?? 'touch',
    x: overrides.x ?? MIDDLE_X,
    y: overrides.y ?? MIDDLE_Y,
  });
}

describe('swipeTurn', () => {
  it('turns to the next page when the finger moves left', () => {
    expect(swipeTurn({ deltaX: -120, deltaY: 0 })).toBe('next');
  });

  it('turns to the previous page when the finger moves right', () => {
    expect(swipeTurn({ deltaX: 120, deltaY: 0 })).toBe('previous');
  });

  it('ignores a horizontal move shorter than the minimum distance', () => {
    expect(swipeTurn({ deltaX: -(SWIPE_MIN_DISTANCE_PX - 1), deltaY: 0 })).toBeNull();
  });

  it('ignores a diagonal move, so a scroll never turns the page', () => {
    expect(swipeTurn({ deltaX: -60, deltaY: 50 })).toBeNull();
  });
});

describe('marginTurn', () => {
  it('turns to the previous page in the left margin', () => {
    expect(
      marginTurn({ x: AREA_RECT.left + 1, areaRect: AREA_RECT, marginWidthPx: MARGIN_PX }),
    ).toBe('previous');
  });

  it('turns to the next page in the right margin', () => {
    expect(
      marginTurn({ x: AREA_RECT.right - 1, areaRect: AREA_RECT, marginWidthPx: MARGIN_PX }),
    ).toBe('next');
  });

  it('does nothing in the text', () => {
    expect(marginTurn({ x: MIDDLE_X, areaRect: AREA_RECT, marginWidthPx: MARGIN_PX })).toBeNull();
  });
});

describe('PageNavigation', () => {
  it('turns to the next page on a touch swipe left', () => {
    const { navigation, onNextPage, onPreviousPage } = buildNavigation();
    press(navigation, { x: 500 });
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).toHaveBeenCalledOnce();
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('turns to the previous page on a touch swipe right', () => {
    const { navigation, onNextPage, onPreviousPage } = buildNavigation();
    press(navigation, { x: 300 });
    navigation.pressEnd(release({ x: 500 }));
    expect(onPreviousPage).toHaveBeenCalledOnce();
    expect(onNextPage).not.toHaveBeenCalled();
  });

  it('never turns the page on a mouse drag, which is a text selection', () => {
    const { navigation, onNextPage, onPreviousPage } = buildNavigation();
    press(navigation, { x: 500, pointerType: 'mouse' });
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('turns to the previous page on a tap in the left margin', () => {
    const { navigation, onPreviousPage } = buildNavigation();
    const x = AREA_RECT.left + MARGIN_PX / 2;
    press(navigation, { x, pointerType: 'mouse' });
    navigation.pressEnd(release({ x }));
    expect(onPreviousPage).toHaveBeenCalledOnce();
  });

  it('turns to the next page on a tap in the right margin', () => {
    const { navigation, onNextPage } = buildNavigation();
    const x = AREA_RECT.right - MARGIN_PX / 2;
    press(navigation, { x });
    navigation.pressEnd(release({ x }));
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it('does nothing on a tap in the text', () => {
    const { navigation, onNextPage, onPreviousPage } = buildNavigation();
    press(navigation);
    navigation.pressEnd(release({}));
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('does nothing when the release is outside the reading area', () => {
    const { navigation, onPreviousPage } = buildNavigation();
    const x = AREA_RECT.left + 1;
    press(navigation, { x, pointerType: 'mouse' });
    navigation.pressEnd(release({ x, y: AREA_RECT.top - 20 }));
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('does nothing while an overlay covers the page', () => {
    const { navigation, onNextPage } = buildNavigation({ isBlocked: true });
    press(navigation, { x: 500 });
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).not.toHaveBeenCalled();
  });

  it('closes an open selection on a swipe without turning the page', () => {
    const { navigation, onNextPage, onPreviousPage } = buildNavigation({ selectionOpen: true });
    press(navigation, { x: 500 });
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('closes an open selection on a margin tap without turning the page', () => {
    const { navigation, onPreviousPage } = buildNavigation({ selectionOpen: true });
    const x = AREA_RECT.left + 1;
    press(navigation, { x });
    navigation.pressEnd(release({ x }));
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('turns the page on the next gesture once the selection is closed', () => {
    const { navigation, onNextPage } = buildNavigation({ selectionOpen: true });
    press(navigation, { x: 500 });
    navigation.pressEnd(release({ x: 300 }));
    press(navigation, { x: 500 });
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it('turns nothing when the browser cancels the press, as it does for a vertical scroll', () => {
    const { navigation, onNextPage } = buildNavigation();
    press(navigation, { x: 500 });
    navigation.pressCancel(1);
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).not.toHaveBeenCalled();
  });

  it('ignores a cancel for a different pointer', () => {
    const { navigation, onNextPage } = buildNavigation();
    press(navigation, { x: 500 });
    navigation.pressCancel(2);
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it('turns nothing for a second finger, so pinch-zoom never turns the page', () => {
    const { navigation, onNextPage } = buildNavigation();
    press(navigation, { x: 500, pointerId: 1 });
    press(navigation, { x: 500, pointerId: 2 });
    navigation.pressEnd(release({ pointerId: 1, x: 300 }));
    navigation.pressEnd(release({ pointerId: 2, x: 300 }));
    expect(onNextPage).not.toHaveBeenCalled();
  });

  it('ignores a release from a pointer that did not start the press', () => {
    const { navigation, onNextPage } = buildNavigation();
    press(navigation, { x: 500, pointerId: 1 });
    navigation.pressEnd(release({ pointerId: 2, x: 300 }));
    navigation.pressEnd(release({ pointerId: 1, x: 300 }));
    expect(onNextPage).toHaveBeenCalledOnce();
  });

  it('turns nothing for the release of a long-press that was abandoned', () => {
    const { navigation, onNextPage } = buildNavigation();
    press(navigation, { x: 500 });
    navigation.abandonPress();
    navigation.pressEnd(release({ x: 300 }));
    expect(onNextPage).not.toHaveBeenCalled();
  });
});
