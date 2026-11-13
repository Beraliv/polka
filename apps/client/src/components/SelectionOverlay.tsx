import { Index, Show, createMemo } from 'solid-js';
import { textRectsInRange } from '../lib/text-offsets.ts';

type SelectionOverlayProps = {
  range: Range;
  containerRect: DOMRect;
  onDragStart: (edge: 'start' | 'end', event: PointerEvent) => void;
};

// Handles carry their own touch listeners purely to stop propagation — the
// underlying touch, not just the Pointer Event, would otherwise still reach
// .reader-content's long-press/tap handling.
function stopTouchPropagation(event: TouchEvent) {
  event.stopPropagation();
}

export function SelectionOverlay(props: SelectionOverlayProps) {
  const rects = createMemo(() => textRectsInRange(props.range));
  const startRect = () => rects()[0];
  const endRect = () => rects().at(-1);

  return (
    <>
      {/* Index rather than For: every drag step yields fresh DOMRect objects,
          so For would recreate every rect div instead of updating in place. */}
      <Index each={rects()}>
        {(rect) => (
          <div
            class="selection-rect"
            style={{
              top: `${rect().top - props.containerRect.top}px`,
              left: `${rect().left - props.containerRect.left}px`,
              width: `${rect().width}px`,
              height: `${rect().height}px`,
            }}
          />
        )}
      </Index>
      <Show when={startRect()}>
        {(rect) => (
          <div
            class="selection-handle selection-handle--start"
            style={{
              top: `${rect().bottom - props.containerRect.top}px`,
              left: `${rect().left - props.containerRect.left}px`,
            }}
            onPointerDown={(event) => props.onDragStart('start', event)}
            onTouchStart={stopTouchPropagation}
            onTouchEnd={stopTouchPropagation}
          />
        )}
      </Show>
      <Show when={endRect()}>
        {(rect) => (
          <div
            class="selection-handle selection-handle--end"
            style={{
              top: `${rect().bottom - props.containerRect.top}px`,
              left: `${rect().right - props.containerRect.left}px`,
            }}
            onPointerDown={(event) => props.onDragStart('end', event)}
            onTouchStart={stopTouchPropagation}
            onTouchEnd={stopTouchPropagation}
          />
        )}
      </Show>
    </>
  );
}
