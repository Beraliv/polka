import { createSignal, createEffect, For, Show, onMount, onCleanup } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { store } from '../store/books.ts';
import { loadProgress, loadRemoteProgress, saveProgress } from '../lib/progress.ts';
import type { Progress } from '@polka/shared';

export function ReaderPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bookId = params.id;

  const pages = () => store.pages[bookId] ?? [];
  const book = () => store.books.find((b) => b.id === bookId);

  const [pageIdx, setPageIdx] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  let smbPath: string | undefined;

  function nextPage() {
    setPageIdx((i) => Math.min(i + 1, pages().length - 1));
    scrollToTop();
  }

  function prevPage() {
    setPageIdx((i) => Math.max(i - 1, 0));
    scrollToTop();
  }

  let contentEl: HTMLDivElement | undefined;
  function scrollToTop() {
    contentEl?.scrollTo({ top: 0 });
  }

  onMount(() => {
    if (!store.pages[bookId]) {
      navigate('/');
      return;
    }

    // Load progress
    const local = loadProgress(bookId);
    if (local) {
      smbPath = local.smbPath;
      if (local.currentPage > 0) {
        setPageIdx(Math.min(local.currentPage - 1, pages().length - 1));
      }
    }

    // Async: merge with remote (use whichever page is further)
    void loadRemoteProgress(bookId).then((remote) => {
      if (!remote) return;
      const localPage = local?.currentPage ?? 0;
      if (remote.currentPage > localPage) {
        setPageIdx(Math.min(remote.currentPage - 1, pages().length - 1));
      }
    });

    setReady(true);

    // Keyboard navigation
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'Escape') {
        navigate('/');
      }
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));
  });

  // Save progress on page change (after initial load)
  createEffect(() => {
    if (!ready()) return;
    const idx = pageIdx();
    const b = book();
    const total = pages().length;
    if (!b || total === 0) return;
    const progress: Progress = {
      bookId,
      bookName: b.name,
      currentPage: idx + 1,
      totalPages: total,
      percent: Math.round(((idx + 1) / total) * 100),
      lastRead: Date.now(),
      finished: idx + 1 >= total,
      smbPath,
    };
    saveProgress(progress);
  });

  // Touch/swipe
  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function handleTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) nextPage();
      else prevPage();
    }
  }

  const currentPage = () => pages()[pageIdx()] ?? [];
  const total = () => pages().length;
  const percent = () => (total() > 0 ? Math.round(((pageIdx() + 1) / total()) * 100) : 0);

  return (
    <div
      class="reader"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div class="reader-header">
        <button class="icon-btn" onClick={() => navigate('/')} title="Back">←</button>
        <span class="reader-book-title">{book()?.name ?? ''}</span>
        <span class="reader-page-info">{pageIdx() + 1} / {total()}</span>
      </div>

      <div class="reader-content" ref={contentEl}>
        <For each={currentPage()}>
          {(paragraph) => <p class="reader-paragraph">{paragraph}</p>}
        </For>
        <Show when={currentPage().length === 0}>
          <p class="reader-paragraph" style={{ color: 'var(--text-muted)' }}>
            (empty page)
          </p>
        </Show>
      </div>

      <div class="reader-footer">
        <button
          class="reader-nav-btn"
          onClick={prevPage}
          disabled={pageIdx() === 0}
          title="Previous page"
        >
          ‹
        </button>
        <div class="reader-progress-wrap">
          <div class="reader-progress-bar">
            <div class="reader-progress-fill" style={{ width: `${percent()}%` }} />
          </div>
          <div class="reader-percent">{percent()}%</div>
        </div>
        <button
          class="reader-nav-btn"
          onClick={nextPage}
          disabled={pageIdx() >= total() - 1}
          title="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
