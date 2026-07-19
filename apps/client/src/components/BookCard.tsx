import { Show } from 'solid-js';
import type { Book, Progress } from '@polka/shared';
import { i18n } from '../i18n';
import { CloseIcon } from './CloseIcon.tsx';

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
  function handleRemove(event: MouseEvent) {
    event.stopPropagation();
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
      title={props.available ? undefined : i18n('bookCard.redownloadTooltip')}
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
          fallback={
            <Show when={props.book.totalPages > 0}>
              <div class="progress-text">{i18n('bookCard.totalPages', { totalPages: props.book.totalPages })}</div>
            </Show>
          }
        >
          {(bookProgress) => (
            <>
              <div class="progress-bar">
                <div class="progress-fill" style={{ width: `${bookProgress().percent}%` }} />
              </div>
              <div class="progress-text">
                {bookProgress().finished
                  ? i18n('bookCard.finished')
                  : i18n('bookCard.pageOfTotal', {
                      currentPage: bookProgress().currentPage,
                      totalPages: bookProgress().totalPages,
                    })}
              </div>
            </>
          )}
        </Show>
      </div>
      <button
        class="remove-btn"
        onClick={handleRemove}
        title={i18n('bookCard.removeTooltip')}
        aria-label={i18n('bookCard.removeTooltip')}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
