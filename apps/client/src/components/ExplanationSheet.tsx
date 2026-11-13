import { createSignal, Show } from 'solid-js';
import { CloseIcon } from './CloseIcon.tsx';
import { ChatMessageContent } from './ChatMessageContent.tsx';
import type { Explanation } from '../lib/explanation-manager.ts';
import { i18n } from '../i18n';

type ExplanationSheetProps = {
  explanation: Explanation;
  onClose: () => void;
};

// How far the sheet has to be dragged down before letting go closes it;
// a shorter drag springs back.
const SWIPE_DISMISS_DISTANCE_PX = 80;

function stopPropagation(event: Event) {
  event.stopPropagation();
}

export function ExplanationSheet(props: ExplanationSheetProps) {
  const [dragOffsetPx, setDragOffsetPx] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  let dragPointerId: number | null = null;
  let dragStartY = 0;

  // Swiping down works from the header only: the body scrolls, and a
  // downward drag there has to scroll the text back up, not close the sheet.
  function handleDragStart(event: PointerEvent) {
    // Capturing the pointer would retarget the close button's click to the
    // header, so presses on it are left alone.
    if (event.button !== 0 || (event.target as Element).closest('button')) {
      return;
    }
    dragPointerId = event.pointerId;
    dragStartY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handleDragMove(event: PointerEvent) {
    if (event.pointerId !== dragPointerId) {
      return;
    }
    setDragOffsetPx(Math.max(0, event.clientY - dragStartY));
  }

  function handleDragEnd(event: PointerEvent) {
    if (event.pointerId !== dragPointerId) {
      return;
    }
    dragPointerId = null;
    setIsDragging(false);
    if (event.type === 'pointerup' && dragOffsetPx() >= SWIPE_DISMISS_DISTANCE_PX) {
      props.onClose();
      return;
    }
    setDragOffsetPx(0);
  }

  const hasReplyText = () => props.explanation.reply.content.length > 0;

  return (
    <div class="explanation-overlay" onClick={() => props.onClose()}>
      <div
        class="explanation-sheet"
        classList={{ dragging: isDragging() }}
        style={{ transform: `translateY(${dragOffsetPx()}px)` }}
        role="dialog"
        aria-label={i18n('explanation.title')}
        onClick={stopPropagation}
      >
        <div
          class="explanation-header"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div class="explanation-grabber" aria-hidden="true" />
          <div class="explanation-title-row">
            <h2 class="explanation-title">{i18n('explanation.title')}</h2>
            <button
              class="icon-btn"
              onClick={() => props.onClose()}
              title={i18n('reader.closeTooltip')}
              aria-label={i18n('explanation.ariaClose')}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div class="explanation-body">
          <blockquote class="explanation-passage">{props.explanation.passage}</blockquote>
          <Show when={hasReplyText()}>
            <div class="explanation-text">
              <ChatMessageContent content={props.explanation.reply.content} />
            </div>
          </Show>
          <Show when={props.explanation.status === 'pending' && !hasReplyText()}>
            <p class="explanation-status">{i18n('explanation.pendingStatus')}</p>
          </Show>
          <Show when={props.explanation.status === 'error'}>
            <p class="explanation-status explanation-error">{props.explanation.errorMessage}</p>
          </Show>
          <Show when={props.explanation.stopReason === 'max_tokens'}>
            <p class="explanation-status">{i18n('explanation.cutOffNotice')}</p>
          </Show>
          <Show when={props.explanation.stopReason === 'refusal'}>
            <p class="explanation-status">{i18n('explanation.declinedNotice')}</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
