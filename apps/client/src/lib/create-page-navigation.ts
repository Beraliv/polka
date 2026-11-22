import { onCleanup } from 'solid-js';
import { MARGIN_ZONE_REM, PageNavigation } from './page-navigation.ts';

type CreatePageNavigationOptions = {
  onPreviousPage: () => void;
  onNextPage: () => void;
  isBlocked: () => boolean;
  dismissSelection: () => boolean;
  getReadingArea: () => HTMLElement | undefined;
};

// The margin is a rem size, so it follows the reader's font-size setting.
function marginWidthPx(): number {
  return MARGIN_ZONE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
}

/**
 * Solid binding for PageNavigation. Press starts come from the reading area;
 * releases and cancels are listened to on window, because a finger can lift
 * outside the reading area (over the header, say) and still has to end its
 * press, or the next tap would look like a second finger.
 */
export function createPageNavigation(options: CreatePageNavigationOptions) {
  const navigation = new PageNavigation({
    onPreviousPage: options.onPreviousPage,
    onNextPage: options.onNextPage,
    isBlocked: options.isBlocked,
    dismissSelection: options.dismissSelection,
  });

  const handlePointerUp = (event: PointerEvent) => {
    const readingArea = options.getReadingArea();
    if (!readingArea) {
      return;
    }
    navigation.pressEnd({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      areaRect: readingArea.getBoundingClientRect(),
      marginWidthPx: marginWidthPx(),
    });
  };
  const handlePointerCancel = (event: PointerEvent) => {
    navigation.pressCancel(event.pointerId);
  };
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerCancel);
  onCleanup(() => {
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
  });

  return {
    pressStart: (event: PointerEvent) => {
      navigation.pressStart({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        x: event.clientX,
        y: event.clientY,
      });
    },
    abandonPress: () => navigation.abandonPress(),
  };
}
