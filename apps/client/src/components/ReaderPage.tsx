import { createSignal, createEffect, For, Show, onMount, onCleanup, batch } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useNavigate, useParams } from '@solidjs/router';
import { store, updateBookTotalPages } from '../store/books.ts';
import { loadProgress, loadRemoteProgress, saveProgress } from '../lib/progress.ts';
import type { SectionItem, Page } from '../lib/paginate.ts';
import type { Progress } from '@polka/shared';

function maxFittingWords(
  container: HTMLElement,
  words: string[],
  availH: number,
): number {
  const el = document.createElement('p');
  el.className = 'reader-paragraph';
  let lo = 0, hi = words.length - 1, count = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    el.textContent = words.slice(0, mid + 1).join(' ');
    container.appendChild(el);
    const fits = container.scrollHeight <= availH;
    container.removeChild(el);
    if (fits) { count = mid + 1; lo = mid + 1; } else { hi = mid - 1; }
  }
  return count;
}

function buildPages(contentEl: HTMLElement, sections: SectionItem[]): Page[] {
  const availH = contentEl.clientHeight;
  const availW = contentEl.clientWidth;
  if (availH <= 0 || availW <= 0 || sections.length === 0) return [];

  // Mirror the real content element's computed styles so measurements are accurate
  const cs = window.getComputedStyle(contentEl);
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'top:-9999px',
    'left:0',
    `width:${availW}px`,
    'box-sizing:border-box',
    `padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    `font-family:${cs.fontFamily}`,
    `font-size:${cs.fontSize}`,
    `line-height:${cs.lineHeight}`,
    'overflow:visible',
    'height:auto',
  ].join(';');
  document.body.appendChild(container);

  const pages: Page[] = [];

  const flush = (current: Page) => {
    pages.push(current);
    container.innerHTML = '';
  };

  for (const section of sections) {
    container.innerHTML = '';
    let current: Page = [];

    if (section.title) {
      const level = Math.min(Math.max(section.level ?? 1, 1), 5);
      current.push({ title: section.title, level });
      const h = document.createElement(`h${level}`);
      h.className = 'reader-section-title';
      h.textContent = section.title;
      container.appendChild(h);
    }

    for (const para of section.paragraphs) {
      let remaining = para;

      while (remaining.length > 0) {
        const el = document.createElement('p');
        el.className = 'reader-paragraph';
        el.textContent = remaining;
        container.appendChild(el);

        if (container.scrollHeight <= availH) {
          // Entire remaining text fits on this page
          current.push({ content: remaining });
          remaining = '';
        } else {
          // Overflow — try to fit as many words as possible
          container.removeChild(el);
          const words = remaining.split(' ');
          const fitting = maxFittingWords(container, words, availH);

          if (fitting > 0) {
            // Put fitting words on current page, carry the rest forward
            current.push({ content: words.slice(0, fitting).join(' ') });
            remaining = words.slice(fitting).join(' ');
            flush(current);
            current = [];
          } else if (current.length > 0) {
            // Nothing fits on the current page — flush it and retry on a fresh page
            flush(current);
            current = [];
          } else {
            // Empty page and still nothing fits (paragraph larger than a full page)
            // Include it as-is to avoid an infinite loop
            current.push({ content: remaining });
            remaining = '';
            flush(current);
            current = [];
          }
        }
      }
    }

    // Section ends: flush remaining page only if it has content
    if (current.length > 0) {
      pages.push(current);
    }
    container.innerHTML = '';
  }

  document.body.removeChild(container);
  return pages;
}

export function ReaderPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bookId = params.id;

  const book = () => store.books.find((b) => b.id === bookId);

  const [pageIdx, setPageIdx] = createSignal(0);
  const [localPages, setLocalPages] = createSignal<Page[]>([]);
  const [ready, setReady] = createSignal(false);
  const [seeking, setSeeking] = createSignal(false);
  const [seekValue, setSeekValue] = createSignal('');
  let smbPath: string | undefined;
  let contentEl: HTMLDivElement | undefined;
  let seekInputEl: HTMLInputElement | undefined;

  function openSeek() {
    setSeekValue(String(pageIdx() + 1));
    setSeeking(true);
    requestAnimationFrame(() => seekInputEl?.select());
  }

  function commitSeek() {
    if (!seeking()) return;
    const n = parseInt(seekValue(), 10);
    if (!isNaN(n)) {
      setPageIdx(Math.min(Math.max(n - 1, 0), total() - 1));
      scrollToTop();
    }
    setSeeking(false);
  }

  function cancelSeek() {
    setSeeking(false);
  }

  function repaginate(restorePercent: number) {
    if (!contentEl) return;
    const sections = store.sections[bookId];
    if (!sections?.length) return;

    const built = buildPages(contentEl, sections);
    updateBookTotalPages(bookId, built.length);
    batch(() => {
      setLocalPages(built);
      setPageIdx(Math.round(restorePercent * Math.max(0, built.length - 1)));
      setReady(true);
    });
  }

  function nextPage() {
    setPageIdx((i) => Math.min(i + 1, localPages().length - 1));
    scrollToTop();
  }

  function prevPage() {
    setPageIdx((i) => Math.max(i - 1, 0));
    scrollToTop();
  }

  function scrollToTop() {
    contentEl?.scrollTo({ top: 0 });
  }

  onMount(() => {
    if (!store.sections[bookId]) {
      navigate('/');
      return;
    }

    const local = loadProgress(bookId);
    smbPath = local?.smbPath;
    const savedPercent = local ? local.percent / 100 : 0;

    void loadRemoteProgress(bookId).then((remote) => {
      if (!remote) return;
      const localPercent = local?.percent ?? 0;
      if (remote.percent > localPercent) {
        const total = localPages().length;
        if (total > 0) {
          setPageIdx(Math.round((remote.percent / 100) * Math.max(0, total - 1)));
        }
      }
    });

    requestAnimationFrame(() => {
      repaginate(savedPercent);
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'Escape') {
        if (seeking()) cancelSeek();
        else navigate('/');
      }
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));

    const handleResize = () => {
      const currentPercent =
        localPages().length > 1 ? pageIdx() / (localPages().length - 1) : 0;
      batch(() => setReady(false));
      requestAnimationFrame(() => repaginate(currentPercent));
    };
    window.addEventListener('resize', handleResize);
    onCleanup(() => window.removeEventListener('resize', handleResize));
  });

  createEffect(() => {
    if (!ready()) return;
    const idx = pageIdx();
    const b = book();
    const total = localPages().length;
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

  const currentPage = () => localPages()[pageIdx()] ?? [];
  const total = () => localPages().length;
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
        <Show when={seeking()} fallback={
          <span class="reader-page-info" onClick={openSeek} title="Go to page">
            {pageIdx() + 1} / {total()}
          </span>
        }>
          <input
            ref={seekInputEl}
            class="reader-page-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={seekValue()}
            onInput={(e) => setSeekValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commitSeek(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancelSeek(); }
            }}
            onBlur={commitSeek}
          />
        </Show>
      </div>

      <div class="reader-content" ref={contentEl}>
        <Show when={!ready()}>
          <div class="reader-loading"><span class="spinner" /></div>
        </Show>
        <Show when={ready()}>
          <For each={currentPage()}>
            {(item) => (
              <Show when={item.content} fallback={
                <Dynamic component={`h${item.level ?? 1}`} class="reader-section-title">{item.title}</Dynamic>
              }>
                <p class="reader-paragraph">{item.content}</p>
              </Show>
            )}
          </For>
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
