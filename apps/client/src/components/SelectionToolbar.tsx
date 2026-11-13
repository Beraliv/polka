import { Portal } from 'solid-js/web';
import { CopyIcon } from './CopyIcon.tsx';
import { GlobeIcon } from './GlobeIcon.tsx';
import { i18n } from '../i18n';

type SelectionToolbarProps = {
  rect: DOMRect;
  containerRect: DOMRect;
  onCopy: () => void;
  onSearchInWeb: () => void;
};

const TOOLBAR_GAP_PX = 8;
// Rough half-width used to keep the toolbar's centered anchor point from
// pushing it past the container edge; the toolbar itself is narrow enough
// that an approximation is fine here.
const TOOLBAR_HALF_WIDTH_PX = 60;

function stopPropagation(event: Event) {
  event.stopPropagation();
}

export function SelectionToolbar(props: SelectionToolbarProps) {
  // Viewport coordinates, matching the toolbar's position: fixed.
  const top = () => Math.max(0, props.rect.top - TOOLBAR_GAP_PX);
  const left = () => {
    const centerX = props.rect.left + props.rect.width / 2;
    const minLeft = props.containerRect.left + TOOLBAR_HALF_WIDTH_PX;
    const maxLeft = Math.max(minLeft, props.containerRect.right - TOOLBAR_HALF_WIDTH_PX);
    return Math.min(Math.max(centerX, minLeft), maxLeft);
  };

  // Portalled out of .reader-content: its overflow: hidden would otherwise
  // clip the toolbar whenever the selection is on the first line, where the
  // toolbar needs to extend up over the reader header.
  return (
    <Portal>
      <div
        class="selection-toolbar"
        style={{ top: `${top()}px`, left: `${left()}px` }}
        onClick={stopPropagation}
        // A press on the toolbar must not reach .reader-content (events
        // from a Solid portal still bubble to where it's mounted), where a
        // mouse pointerdown dismisses the selection before the click lands.
        onPointerDown={stopPropagation}
        onTouchStart={stopPropagation}
        onTouchEnd={stopPropagation}
      >
        <button
          class="selection-toolbar-btn"
          onClick={props.onCopy}
          onTouchEnd={props.onCopy}
          title={i18n('reader.copyTooltip')}
          aria-label={i18n('reader.copyTooltip')}
        >
          <CopyIcon />
        </button>
        <button
          class="selection-toolbar-btn"
          onClick={props.onSearchInWeb}
          onTouchEnd={props.onSearchInWeb}
          title={i18n('reader.searchInWebTooltip')}
          aria-label={i18n('reader.searchInWebTooltip')}
        >
          <GlobeIcon />
        </button>
      </div>
    </Portal>
  );
}
