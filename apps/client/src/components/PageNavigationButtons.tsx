import { i18n } from '../i18n';
import { ChevronLeftIcon } from './ChevronLeftIcon.tsx';
import { ChevronRightIcon } from './ChevronRightIcon.tsx';

type PageNavigationButtonsProps = {
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

// These sit inside the reading area, so their presses would otherwise also
// reach PageNavigation as margin taps. Stopping the press here leaves the turn
// to the button's click, which runs once.
function keepPressFromReadingArea(event: PointerEvent) {
  event.stopPropagation();
}

export function PageNavigationButtons(props: PageNavigationButtonsProps) {
  return (
    <>
      <button
        class="reader-nav-overlay reader-nav-overlay--prev"
        onPointerDown={keepPressFromReadingArea}
        onClick={props.onPrevious}
        disabled={!props.canGoPrevious}
        title={i18n('reader.previousPage')}
        aria-label={i18n('reader.previousPage')}
      >
        <ChevronLeftIcon />
      </button>
      <button
        class="reader-nav-overlay reader-nav-overlay--next"
        onPointerDown={keepPressFromReadingArea}
        onClick={props.onNext}
        disabled={!props.canGoNext}
        title={i18n('reader.nextPage')}
        aria-label={i18n('reader.nextPage')}
      >
        <ChevronRightIcon />
      </button>
    </>
  );
}
