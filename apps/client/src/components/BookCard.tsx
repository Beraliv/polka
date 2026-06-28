import { Show } from 'solid-js';
import type { Book, Progress } from '@polka/shared';

type Props = {
  book: Book;
  progress?: Progress;
  available: boolean;
  loading?: boolean;
  onOpen: () => void;
  onReopen: () => void;
  onRemove: () => void;
};

export function BookCard(props: Props) {
  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    props.onRemove();
  }

  function handleClick() {
    if (props.available) {
      props.onOpen();
    } else {
      props.onReopen();
    }
  }

  return (
    <div
      class={`book-card${props.available ? '' : ' unavailable'}${props.loading ? ' loading' : ''}`}
      onClick={handleClick}
      title={props.available ? undefined : 'Tap to re-download from NAS'}
    >
      <div class="book-cover-placeholder">
        <span class="book-format-badge">{props.book.format}</span>
      </div>
      <div class="book-info">
        <div class="book-title">{props.book.name}</div>
        <Show when={props.book.author}>
          <div class="book-author">{props.book.author}</div>
        </Show>
        <Show
          when={props.progress}
          fallback={<div class="progress-text">{props.book.totalPages} pages</div>}
        >
          {(p) => (
            <>
              <div class="progress-bar">
                <div class="progress-fill" style={{ width: `${p().percent}%` }} />
              </div>
              <div class="progress-text">
                {p().finished
                  ? 'Finished'
                  : `Page ${p().currentPage} of ${p().totalPages}`}
              </div>
            </>
          )}
        </Show>
      </div>
      <button class="remove-btn" onClick={handleRemove} title="Remove">✕</button>
    </div>
  );
}
