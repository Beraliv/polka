import { createSignal, createEffect, For, Show, Switch, Match, onMount, onCleanup, batch } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useNavigate, useParams } from '@solidjs/router';
import { store, setStore, BookStore } from '../store/books.ts';
import { loadProgress, loadRemoteProgress, saveProgress } from '../lib/progress.ts';
import { BookFilesDB } from '../lib/polka-db.ts';
import { parseEPUB } from '../lib/epub.ts';
import { parseFB2 } from '../lib/fb2.ts';
import { isEmptyLine, isImage, ParagraphType } from '../lib/paginate.ts';
import type { SectionItem, Page, RichParagraph, NoteRef, Note, BookImageAsset } from '../lib/paginate.ts';
import { decodeImageAssets } from '../lib/images.ts';
import type { Progress } from '@polka/shared';

// Internal token for pagination: plain words or atomic note references.
type Token = { text: string } | NoteRef;

function tokenize(paragraph: RichParagraph): Token[] {
  const tokens: Token[] = [];
  for (const span of paragraph) {
    if (typeof span === 'string') {
      for (const word of span.split(/\s+/).filter(Boolean)) {
        tokens.push({ text: word });
      }
    } else {
      tokens.push(span);
    }
  }
  return tokens;
}

function tokensText(tokens: Token[]): string {
  return tokens.map((token) => ('text' in token ? token.text : token.label)).join(' ');
}

function tokensToRich(tokens: Token[]): RichParagraph {
  const segments: RichParagraph = [];
  let textBuffer = '';
  for (const token of tokens) {
    if ('text' in token) {
      textBuffer += (textBuffer ? ' ' : '') + token.text;
    } else {
      if (textBuffer) { segments.push(textBuffer); textBuffer = ''; }
      segments.push(token);
    }
  }
  if (textBuffer) segments.push(textBuffer);
  return segments;
}

type MaxFittingTokensOptions = {
  container: HTMLElement;
  tokens: Token[];
  availableHeight: number;
  noIndent: boolean;
};

function maxFittingTokens({ container, tokens, availableHeight, noIndent }: MaxFittingTokensOptions): number {
  const measureEl = document.createElement('p');
  measureEl.className = noIndent ? 'reader-paragraph no-indent' : 'reader-paragraph';
  let low = 0, high = tokens.length - 1, count = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    measureEl.textContent = tokensText(tokens.slice(0, mid + 1));
    container.appendChild(measureEl);
    const fits = container.scrollHeight <= availableHeight;
    container.removeChild(measureEl);
    if (fits) { count = mid + 1; low = mid + 1; } else { high = mid - 1; }
  }
  return count;
}

// Illustrations are capped to a fraction of the page's content box so the
// surrounding text keeps enough room for context.
const MAX_IMAGE_WIDTH_FRACTION = 0.8;
const MAX_IMAGE_HEIGHT_FRACTION = 0.6;

type BuildPagesOptions = {
  pageEl: HTMLElement;
  sections: SectionItem[];
  imageAssets: Record<string, BookImageAsset>;
};

function buildPages({ pageEl, sections, imageAssets }: BuildPagesOptions): Page[] {
  const availableHeight = pageEl.clientHeight;
  const availableWidth = pageEl.clientWidth;
  if (availableHeight <= 0 || availableWidth <= 0 || sections.length === 0) return [];

  // Mirror the real page element's computed styles so measurements are accurate
  const computedStyle = window.getComputedStyle(pageEl);
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'top:-9999px',
    'left:0',
    `width:${availableWidth}px`,
    'box-sizing:border-box',
    `padding:${computedStyle.paddingTop} ${computedStyle.paddingRight} ${computedStyle.paddingBottom} ${computedStyle.paddingLeft}`,
    `font-family:${computedStyle.fontFamily}`,
    `font-size:${computedStyle.fontSize}`,
    `line-height:${computedStyle.lineHeight}`,
    'overflow:visible',
    'height:auto',
  ].join(';');
  document.body.appendChild(container);

  // clientWidth/clientHeight include padding, so subtract it to get the space
  // actually available to content such as images.
  const contentWidth =
    availableWidth - parseFloat(computedStyle.paddingLeft) - parseFloat(computedStyle.paddingRight);
  const contentHeight =
    availableHeight - parseFloat(computedStyle.paddingTop) - parseFloat(computedStyle.paddingBottom);

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
      const headingEl = document.createElement(`h${level}`);
      headingEl.className = 'reader-section-title';
      headingEl.textContent = section.title;
      container.appendChild(headingEl);
    }

    for (const paragraph of section.paragraphs) {
      if (isImage(paragraph)) {
        const asset = imageAssets[paragraph.imageId];
        if (!asset) continue;
        // Scale down to the maximum display size, preserving the aspect ratio.
        const scale = Math.min(
          1,
          (contentWidth * MAX_IMAGE_WIDTH_FRACTION) / asset.width,
          (contentHeight * MAX_IMAGE_HEIGHT_FRACTION) / asset.height,
        );
        const imageHeight = Math.floor(asset.height * scale);
        const imagePlaceholderEl = document.createElement('div');
        imagePlaceholderEl.className = 'reader-image';
        imagePlaceholderEl.style.height = `${imageHeight}px`;
        container.appendChild(imagePlaceholderEl);
        if (container.scrollHeight > availableHeight && current.length > 0) {
          container.removeChild(imagePlaceholderEl);
          flush(current);
          current = [];
          container.appendChild(imagePlaceholderEl);
        }
        current.push({ type: ParagraphType.Image, imageId: paragraph.imageId, imageHeight });
        continue;
      }

      if (isEmptyLine(paragraph)) {
        // An empty line at the top of a page carries no meaning — drop it.
        if (current.length === 0) continue;
        const emptyLineEl = document.createElement('div');
        emptyLineEl.className = 'reader-empty-line';
        container.appendChild(emptyLineEl);
        if (container.scrollHeight <= availableHeight) {
          current.push({ type: ParagraphType.EmptyLine });
        } else {
          container.removeChild(emptyLineEl);
          flush(current);
          current = [];
        }
        continue;
      }

      let remaining: Token[] = tokenize(paragraph);
      // The tail of a paragraph split across a page boundary continues the
      // same paragraph, so it must render without the first-line indent.
      let isContinuation = false;

      while (remaining.length > 0) {
        const paragraphEl = document.createElement('p');
        paragraphEl.className = isContinuation ? 'reader-paragraph no-indent' : 'reader-paragraph';
        paragraphEl.textContent = tokensText(remaining);
        container.appendChild(paragraphEl);

        if (container.scrollHeight <= availableHeight) {
          current.push({ content: tokensToRich(remaining), noIndent: isContinuation });
          remaining = [];
        } else {
          container.removeChild(paragraphEl);
          const fitting = maxFittingTokens({
            container,
            tokens: remaining,
            availableHeight,
            noIndent: isContinuation,
          });

          if (fitting > 0) {
            current.push({ content: tokensToRich(remaining.slice(0, fitting)), noIndent: isContinuation });
            remaining = remaining.slice(fitting);
            isContinuation = true;
            flush(current);
            current = [];
          } else if (current.length > 0) {
            flush(current);
            current = [];
          } else {
            // Paragraph larger than a full page — include as-is to avoid infinite loop
            current.push({ content: tokensToRich(remaining), noIndent: isContinuation });
            remaining = [];
            flush(current);
            current = [];
          }
        }
      }
    }

    if (current.length > 0) {
      pages.push(current);
    }
    container.innerHTML = '';
  }

  document.body.removeChild(container);
  return pages;
}

/**
 * Returns the progress as a fraction between 0 and 1 based on the current page
 * and total pages.
 */
function progressFraction(progress: Progress | null): number {
  if (!progress || progress.totalPages <= 1) return 0;
  return (progress.currentPage - 1) / (progress.totalPages - 1);
}

type PageContentProps = {
  items: Page;
  imageAssets: Record<string, BookImageAsset>;
  onNoteClick: (noteId: string) => void;
};

function PageContent(props: PageContentProps) {
  return (
    <For each={props.items}>
      {(item) => (
        <Switch fallback={
          <Dynamic component={`h${item.level ?? 1}`} class="reader-section-title">{item.title}</Dynamic>
        }>
          <Match when={item.type === ParagraphType.EmptyLine}>
            <div class="reader-empty-line" />
          </Match>
          <Match when={item.type === ParagraphType.Image}>
            <img
              class="reader-image"
              src={props.imageAssets[item.imageId!]?.dataUrl}
              style={{ height: `${item.imageHeight}px` }}
              alt=""
            />
          </Match>
          <Match when={item.content !== undefined}>
            <p class="reader-paragraph" classList={{ 'no-indent': item.noIndent }}>
              <For each={item.content!}>
                {(span) => {
                  if (typeof span === 'string') return <>{span}</>;
                  return (
                    <button
                      class="footnote-ref"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onNoteClick(span.noteId);
                      }}
                    >
                      {span.label}
                    </button>
                  );
                }}
              </For>
            </p>
          </Match>
        </Switch>
      )}
    </For>
  );
}

export function ReaderPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bookId = params.id;

  const book = () => store.books.find((b) => b.id === bookId);

  const desktopMediaQuery = window.matchMedia('(min-width: 900px)');
  const [isTwoPageView, setIsTwoPageView] = createSignal(desktopMediaQuery.matches);
  const [pageIdx, setPageIdx] = createSignal(0);
  const [localPages, setLocalPages] = createSignal<Page[]>([]);
  const [ready, setReady] = createSignal(false);
  const [seeking, setSeeking] = createSignal(false);
  const [seekValue, setSeekValue] = createSignal('');
  const [activeNoteId, setActiveNoteId] = createSignal<string | null>(null);
  const [imageAssets, setImageAssets] = createSignal<Record<string, BookImageAsset>>({});
  let smbPath: string | undefined;
  let contentEl: HTMLDivElement | undefined;
  let pageEl: HTMLDivElement | undefined;
  let seekInputEl: HTMLInputElement | undefined;
  let touchStartX = 0;
  let touchStartY = 0;

  const pageStep = () => (isTwoPageView() ? 2 : 1);

  // In two-page view, spreads always start on an even index so page pairs stay stable.
  function clampPageIndex(index: number, totalPages: number): number {
    const maxIndex = Math.max(0, totalPages - 1);
    const clamped = Math.min(Math.max(index, 0), maxIndex);
    return isTwoPageView() ? clamped - (clamped % 2) : clamped;
  }

  const activeNote = (): Note | null => {
    const id = activeNoteId();
    if (!id) return null;
    return store.notes?.[bookId]?.[id] ?? null;
  };

  function openSeek() {
    setSeekValue(String(pageIdx() + 1));
    setSeeking(true);
    requestAnimationFrame(() => seekInputEl?.select());
  }

  function commitSeek() {
    if (!seeking()) return;
    const n = parseInt(seekValue(), 10);
    if (!isNaN(n)) {
      setPageIdx(clampPageIndex(n - 1, total()));
      scrollToTop();
    }
    setSeeking(false);
  }

  function cancelSeek() {
    setSeeking(false);
  }

  function repaginate(restoreFraction: number) {
    if (!pageEl) return;
    const sections = store.sections[bookId];
    if (!sections?.length) return;

    const built = buildPages({ pageEl, sections, imageAssets: imageAssets() });
    BookStore.updateTotalPages(bookId, built.length);
    batch(() => {
      setLocalPages(built);
      const restoredIndex = Math.round(restoreFraction * Math.max(0, built.length - 1));
      setPageIdx(clampPageIndex(restoredIndex, built.length));
      setReady(true);
    });
  }

  function nextPage() {
    setPageIdx((current) => clampPageIndex(current + pageStep(), localPages().length));
    scrollToTop();
  }

  function prevPage() {
    setPageIdx((current) => clampPageIndex(current - pageStep(), localPages().length));
    scrollToTop();
  }

  function scrollToTop() {
    contentEl?.scrollTo({ top: 0 });
  }

  onMount(() => {
    const originalLang = document.documentElement.lang;
    onCleanup(() => { document.documentElement.lang = originalLang; });

    async function init() {
      if (!store.sections[bookId]) {
        const file = await BookFilesDB.download(bookId);
        if (!file) {
          navigate('/');
          return;
        }
        const parsed = file.format === 'epub' ? parseEPUB(file.arrayBuffer) : parseFB2(file.arrayBuffer);
        setStore('sections', bookId, parsed.sections);
        if (parsed.notes) setStore('notes', bookId, parsed.notes);
        setStore('images', bookId, parsed.images ?? {});
      }

      // Decode image sizes before the first pagination so image heights are known.
      setImageAssets(await decodeImageAssets(store.images[bookId] ?? {}));

      const bookLang = book()?.lang;
      if (bookLang) document.documentElement.lang = bookLang;

      const local = loadProgress(bookId);
      smbPath = local?.smbPath;
      const localFraction = progressFraction(local);

      void loadRemoteProgress(bookId).then((remote) => {
        if (!remote) return;
        const remoteFraction = progressFraction(remote);
        if (remoteFraction > progressFraction(loadProgress(bookId))) {
          const total = localPages().length;
          if (total > 0) {
            const remoteIndex = Math.round(remoteFraction * Math.max(0, total - 1));
            setPageIdx(clampPageIndex(remoteIndex, total));
          }
        }
      });

      requestAnimationFrame(() => {
        repaginate(localFraction);
      });
    }

    void init();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        if (activeNoteId()) return;
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (activeNoteId()) return;
        e.preventDefault();
        prevPage();
      } else if (e.key === 'Escape') {
        if (activeNoteId()) setActiveNoteId(null);
        else if (seeking()) cancelSeek();
        else navigate('/');
      }
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));

    const handleResize = () => {
      const currentFraction =
        localPages().length > 1 ? pageIdx() / (localPages().length - 1) : 0;
      batch(() => setReady(false));
      requestAnimationFrame(() => repaginate(currentFraction));
    };
    window.addEventListener('resize', handleResize);
    onCleanup(() => window.removeEventListener('resize', handleResize));

    // Repagination itself is driven by the resize handler above; this only flips the layout mode.
    const handleDesktopMediaChange = (event: MediaQueryListEvent) => {
      setIsTwoPageView(event.matches);
    };
    desktopMediaQuery.addEventListener('change', handleDesktopMediaChange);
    onCleanup(() => desktopMediaQuery.removeEventListener('change', handleDesktopMediaChange));
  });

  createEffect(() => {
    if (!ready()) return;
    const idx = pageIdx();
    const b = book();
    const total = localPages().length;
    if (!b || total === 0) return;
    const lastVisiblePage = Math.min(idx + pageStep(), total);
    const progress: Progress = {
      bookId,
      bookName: b.name,
      currentPage: idx + 1,
      totalPages: total,
      percent: Math.round((lastVisiblePage / total) * 100),
      lastRead: Date.now(),
      finished: lastVisiblePage >= total,
      smbPath,
    };
    saveProgress(progress);
  });

  function handleContentTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (t) { touchStartX = t.clientX; touchStartY = t.clientY; }
  }

  function handleContentTouchEnd(e: TouchEvent) {
    if (activeNoteId()) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (Math.abs(t.clientX - touchStartX) > 10 || Math.abs(t.clientY - touchStartY) > 10) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = 2 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (t.clientX < rect.left + zone) prevPage();
    else if (t.clientX > rect.right - zone) nextPage();
  }

  const currentPage = () => localPages()[pageIdx()] ?? [];
  const secondPage = () => localPages()[pageIdx() + 1] ?? [];
  const total = () => localPages().length;
  const lastVisiblePageNumber = () => Math.min(pageIdx() + pageStep(), total());
  const percent = () => (total() > 0 ? Math.round((lastVisiblePageNumber() / total()) * 100) : 0);
  const pageRangeLabel = () => {
    const firstPageNumber = pageIdx() + 1;
    const lastPageNumber = lastVisiblePageNumber();
    return lastPageNumber > firstPageNumber ? `${firstPageNumber}-${lastPageNumber}` : `${firstPageNumber}`;
  };

  return (
    <div class="reader">
      <div class="reader-header">
        <button class="icon-btn" onClick={() => navigate('/')} title="Back">←</button>
        <span class="reader-book-title">{book()?.name ?? ''}</span>
        <Show when={seeking()} fallback={
          <span class="reader-page-info" onClick={openSeek} title="Go to page">
            {pageRangeLabel()} / {total()}
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

      <div
        class="reader-content"
        ref={contentEl}
        onTouchStart={handleContentTouchStart}
        onTouchEnd={handleContentTouchEnd}
      >
        <button
          class="reader-nav-overlay reader-nav-overlay--prev"
          onClick={prevPage}
          disabled={pageIdx() === 0}
          title="Previous page"
          aria-label="Previous page"
        >
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 2L2 9L8 16" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="reader-nav-overlay reader-nav-overlay--next"
          onClick={nextPage}
          disabled={lastVisiblePageNumber() >= total()}
          title="Next page"
          aria-label="Next page"
        >
          <svg width="10" height="18" viewBox="0 0 10 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2L8 9L2 16" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <Show when={!ready()}>
          <div class="reader-loading"><span class="spinner" /></div>
        </Show>
        <div class="reader-pages">
          <div class="reader-page" ref={pageEl}>
            <Show when={ready()}>
              <PageContent items={currentPage()} imageAssets={imageAssets()} onNoteClick={setActiveNoteId} />
            </Show>
          </div>
          <Show when={isTwoPageView()}>
            <div class="reader-page">
              <Show when={ready()}>
                <PageContent items={secondPage()} imageAssets={imageAssets()} onNoteClick={setActiveNoteId} />
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <div class="reader-footer">
        <div class="reader-progress-wrap">
          <div class="reader-progress-bar">
            <div class="reader-progress-fill" style={{ width: `${percent()}%` }} />
          </div>
          <div class="reader-percent">{percent()}%</div>
        </div>
      </div>

      <Show when={activeNote() !== null}>
        <div class="note-popup-overlay" onClick={() => setActiveNoteId(null)}>
          <div class="note-popup" onClick={(e) => e.stopPropagation()}>
            <div class="note-popup-content">
              <Show when={activeNote()?.title}>
                <h2 class="note-popup-title">{activeNote()?.title}</h2>
              </Show>
              <p class="note-popup-text">{activeNote()?.text}</p>
            </div>
            <button class="note-popup-close" onClick={() => setActiveNoteId(null)} aria-label="Close">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
