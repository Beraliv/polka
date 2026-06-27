import { Show } from 'solid-js';
import type { Book, Progress } from '@polka/shared';

type Props = {
  book: Book;
  progress?: Progress;
  available: boolean;
  onOpen: () => void;
  onRemove: () => void;
};

export function BookCard(props: Props) {
  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    props.onRemove();
  }

  return (
    <div
      class={`book-card${props.available ? '' : ' unavailable'}`}
      onClick={() => props.available && props.onOpen()}
      title={props.available ? undefined : 'Re-open this book to continue reading'}
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
