import {
  createSignal,
  createEffect,
  For,
  Show,
  Switch,
  Match,
  onMount,
  onCleanup,
  batch,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useNavigate, useParams } from '@solidjs/router';
import { ChevronLeftIcon } from './ChevronLeftIcon.tsx';
import { ChevronRightIcon } from './ChevronRightIcon.tsx';
import { CloseIcon } from './CloseIcon.tsx';
import { TocIcon } from './TocIcon.tsx';
import { store, setStore, BookStore } from '../store/books.ts';
import { saveProgress, resolveBestProgress, progressFraction } from '../lib/progress.ts';
import { BookFilesDB } from '../lib/polka-db.ts';
import {
  parseBook,
  decodeImageAssets,
  asPageEmptyLine,
  asPageHeading,
  asPageImage,
  asPageParagraph,
  hasAnyStyle,
  isEmptyLine,
  isImage,
  isNoteRef,
  PageElementType,
} from '../lib/book';
import type {
  SectionItem,
  Page,
  Paragraph,
  NoteRef,
  Note,
  BookImageAsset,
  TextStyle,
  TocEntry as ParsedTocEntry,
} from '../lib/book';
import type { Progress } from '@polka/shared';
import { i18n } from '../i18n';
import { debounce } from '../lib/debounce.ts';
import { formatDuration } from '../lib/formatDuration.ts';

// Internal token for pagination: words (optionally styled) or atomic note references.
type Token = { text: string; style?: TextStyle } | NoteRef;

function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function tokenize(paragraph: Paragraph): Token[] {
  const tokens: Token[] = [];
  for (const span of paragraph) {
    if (typeof span === 'string') {
      for (const word of splitIntoWords(span)) {
        tokens.push({ text: word });
      }
    } else if (isNoteRef(span)) {
      tokens.push(span);
    } else {
      for (const word of splitIntoWords(span.text)) {
        tokens.push({ text: word, style: span.style });
      }
    }
  }
  return tokens;
}

function sameStyle(first: TextStyle | undefined, second: TextStyle | undefined): boolean {
  return (
    Boolean(first?.italic) === Boolean(second?.italic) &&
    Boolean(first?.bold) === Boolean(second?.bold)
  );
}

function tokensToRich(tokens: Token[]): Paragraph {
  const segments: Paragraph = [];
  let textBuffer = '';
  let bufferStyle: TextStyle | undefined;

  const flushTextBuffer = () => {
    if (!textBuffer) {
      return;
    }
    if (bufferStyle && hasAnyStyle(bufferStyle)) {
      segments.push({ text: textBuffer, style: bufferStyle });
    } else {
      segments.push(textBuffer);
    }
    textBuffer = '';
  };

  for (const token of tokens) {
    if (isNoteRef(token)) {
      flushTextBuffer();
      segments.push(token);
      continue;
    }
    if (textBuffer && !sameStyle(bufferStyle, token.style)) {
      // Keep the word gap visible across a style boundary.
      textBuffer += ' ';
      flushTextBuffer();
    }
    bufferStyle = token.style;
    textBuffer += (textBuffer ? ' ' : '') + token.text;
  }
  flushTextBuffer();
  return segments;
}

type AppendRichTextOptions = { element: HTMLElement; segments: Paragraph };

// Mirrors PageContent's paragraph markup inside the hidden measurement
// container, so styled runs (wider bold glyphs, italics) measure exactly as
// they render.
function appendRichText({ element, segments }: AppendRichTextOptions): void {
  for (const segment of segments) {
    if (typeof segment === 'string') {
      element.append(segment);
    } else if (isNoteRef(segment)) {
      element.append(segment.label);
    } else {
      let host: HTMLElement = element;
      if (segment.style.bold) {
        const strongEl = document.createElement('strong');
        host.append(strongEl);
        host = strongEl;
      }
      if (segment.style.italic) {
        const emEl = document.createElement('em');
        host.append(emEl);
        host = emEl;
      }
      host.append(segment.text);
    }
  }
}

type MaxFittingTokensOptions = {
  container: HTMLElement;
  tokens: Token[];
  availableHeight: number;
  noIndent: boolean;
};

function maxFittingTokens({
  container,
  tokens,
  availableHeight,
  noIndent,
}: MaxFittingTokensOptions): number {
  const measureEl = document.createElement('p');
  measureEl.className = noIndent ? 'reader-paragraph no-indent' : 'reader-paragraph';
  let low = 0,
    high = tokens.length - 1,
    count = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    measureEl.textContent = '';
    appendRichText({ element: measureEl, segments: tokensToRich(tokens.slice(0, mid + 1)) });
    container.appendChild(measureEl);
    const fits = container.scrollHeight <= availableHeight;
    container.removeChild(measureEl);
    if (fits) {
      count = mid + 1;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
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

type BuiltPagination = {
  pages: Page[];
  // For every section, the index of the page it starts on — pages never span
  // sections, so each section begins a fresh page. Drives the table of contents.
  sectionStartPageIndexes: number[];
};

function buildPages({ pageEl, sections, imageAssets }: BuildPagesOptions): BuiltPagination {
  const availableHeight = pageEl.clientHeight;
  const availableWidth = pageEl.clientWidth;
  if (availableHeight <= 0 || availableWidth <= 0 || sections.length === 0) {
    return { pages: [], sectionStartPageIndexes: [] };
  }

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
    availableHeight -
    parseFloat(computedStyle.paddingTop) -
    parseFloat(computedStyle.paddingBottom);

  const pages: Page[] = [];
  const sectionStartPageIndexes: number[] = [];

  const flush = (current: Page) => {
    pages.push(current);
    container.innerHTML = '';
  };

  for (const section of sections) {
    sectionStartPageIndexes.push(pages.length);
    container.innerHTML = '';
    let current: Page = [];

    if (section.title) {
      const level = Math.min(Math.max(section.level ?? 1, 1), 5);
      current.push({ type: PageElementType.Heading, level, title: section.title });
      const headingEl = document.createElement(`h${level}`);
      headingEl.className = 'reader-section-title';
      headingEl.textContent = section.title;
      container.appendChild(headingEl);
    }

    for (const paragraph of section.paragraphs) {
      if (isImage(paragraph)) {
        const asset = imageAssets[paragraph.imageId];
        if (!asset) {
          continue;
        }
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
        current.push({ type: PageElementType.Image, imageId: paragraph.imageId, imageHeight });
        continue;
      }

      if (isEmptyLine(paragraph)) {
        // An empty line at the top of a page carries no meaning — drop it.
        if (current.length === 0) {
          continue;
        }
        const emptyLineEl = document.createElement('div');
        emptyLineEl.className = 'reader-empty-line';
        container.appendChild(emptyLineEl);
        if (container.scrollHeight <= availableHeight) {
          current.push({ type: PageElementType.EmptyLine });
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
        appendRichText({ element: paragraphEl, segments: tokensToRich(remaining) });
        container.appendChild(paragraphEl);

        if (container.scrollHeight <= availableHeight) {
          current.push({
            type: PageElementType.Paragraph,
            content: tokensToRich(remaining),
            noIndent: isContinuation,
          });
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
            current.push({
              type: PageElementType.Paragraph,
              content: tokensToRich(remaining.slice(0, fitting)),
              noIndent: isContinuation,
            });
            remaining = remaining.slice(fitting);
            isContinuation = true;
            flush(current);
            current = [];
          } else if (current.length > 0) {
            flush(current);
            current = [];
          } else {
            // Paragraph larger than a full page — include as-is to avoid infinite loop
            current.push({
              type: PageElementType.Paragraph,
              content: tokensToRich(remaining),
              noIndent: isContinuation,
            });
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
  return { pages, sectionStartPageIndexes };
}

// A touch is treated as a tap only if the finger stayed within this distance,
// mirroring the reader's page-turn tap detection.
const TAP_MOVE_TOLERANCE_PX = 10;

// Long enough to outlast a resize burst from a live window drag, short enough
// that the reader doesn't feel stuck on the loading spinner.
const RESIZE_DEBOUNCE_MS = 150;

type ReaderImageProps = {
  src: string | undefined;
  height: number;
  onOpen: () => void;
};

function ReaderImage(props: ReaderImageProps) {
  let touchStartX = 0;
  let touchStartY = 0;

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (touch) {
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const isTap =
      Math.abs(touch.clientX - touchStartX) <= TAP_MOVE_TOLERANCE_PX &&
      Math.abs(touch.clientY - touchStartY) <= TAP_MOVE_TOLERANCE_PX;
    if (!isTap) {
      return;
    }
    // Suppress the synthetic click that follows the tap and keep the tap away
    // from the reader's edge-tap page navigation.
    event.preventDefault();
    event.stopPropagation();
    props.onOpen();
  }

  return (
    <img
      class="reader-image"
      src={props.src}
      style={{ height: `${props.height}px` }}
      alt=""
      onClick={(event) => {
        event.stopPropagation();
        props.onOpen();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    />
  );
}

type PageContentProps = {
  items: Page;
  imageAssets: Record<string, BookImageAsset | undefined>;
  onNoteClick: (noteId: string) => void;
  onImageOpen: (imageId: string) => void;
};

function PageContent(props: PageContentProps) {
  return (
    <For each={props.items}>
      {(item) => (
        <Switch>
          <Match when={asPageHeading(item)} keyed>
            {(heading) => (
              <Dynamic component={`h${heading.level}`} class="reader-section-title">
                {heading.title}
              </Dynamic>
            )}
          </Match>
          <Match when={asPageEmptyLine(item)}>
            <div class="reader-empty-line" />
          </Match>
          <Match when={asPageImage(item)} keyed>
            {(image) => (
              <ReaderImage
                src={props.imageAssets[image.imageId]?.dataUrl}
                height={image.imageHeight}
                onOpen={() => props.onImageOpen(image.imageId)}
              />
            )}
          </Match>
          <Match when={asPageParagraph(item)} keyed>
            {(paragraph) => (
              <p class="reader-paragraph" classList={{ 'no-indent': paragraph.noIndent }}>
                <For each={paragraph.content}>
                  {(span) => {
                    if (typeof span === 'string') {
                      return <>{span}</>;
                    }
                    if (isNoteRef(span)) {
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
                    }
                    const italicText = span.style.italic ? <em>{span.text}</em> : <>{span.text}</>;
                    return span.style.bold ? <strong>{italicText}</strong> : italicText;
                  }}
                </For>
              </p>
            )}
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

  const book = () => store.books.find((candidate) => candidate.id === bookId);

  // Must be synced with `@media` query in styles.css
  const desktopMediaQuery = window.matchMedia('(min-width: 900px) and (min-height: 500px)');
  const [isTwoPageView, setIsTwoPageView] = createSignal(desktopMediaQuery.matches);
  const [pageIdx, setPageIdx] = createSignal(0);
  const [localPages, setLocalPages] = createSignal<Page[]>([]);
  const [sectionStartPageIndexes, setSectionStartPageIndexes] = createSignal<number[]>([]);
  // One signal rather than separate booleans, so nothing can act on the
  // reader (e.g. handleResize below) while it's ambiguously between states.
  const [stage, setStage] = createSignal<'loading' | 'parsing' | 'paginating' | 'ready'>('loading');
  const ready = () => stage() === 'ready';
  const [tocOpen, setTocOpen] = createSignal(false);
  const [activeNoteId, setActiveNoteId] = createSignal<string | null>(null);
  const [fullscreenImageId, setFullscreenImageId] = createSignal<string | null>(null);
  const [imageAssets, setImageAssets] = createSignal<Record<string, BookImageAsset>>({});
  let smbPath: string | undefined;
  let contentEl: HTMLDivElement | undefined;
  let pageEl: HTMLDivElement | undefined;
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
    if (!id) {
      return null;
    }
    return store.notes?.[bookId]?.[id] ?? null;
  };

  const fullscreenImage = (): BookImageAsset | null => {
    const id = fullscreenImageId();
    if (!id) {
      return null;
    }
    return imageAssets()[id] ?? null;
  };

  type TocEntry = { title: string; level: number; pageIndex: number };

  // The book's TOC entries (from the EPUB nav/NCX, or derived from FB2/EPUB
  // section headings — see parseBook) paired with the page each one starts
  // on. Entries whose section never got paginated (still loading) are left
  // out.
  const tocEntries = (): TocEntry[] => {
    const parsedEntries = store.toc[bookId] ?? [];
    const startPageIndexes = sectionStartPageIndexes();
    const entries: TocEntry[] = [];
    parsedEntries.forEach((entry: ParsedTocEntry) => {
      const pageIndex = startPageIndexes[entry.sectionIndex];
      if (pageIndex === undefined) {
        return;
      }
      const level = Math.min(Math.max(entry.level, 1), 5);
      entries.push({ title: entry.title, level, pageIndex });
    });
    return entries;
  };

  // Index into tocEntries() of the chapter the reader is currently in: the
  // last entry that starts on or before the currently visible pages.
  const activeTocEntryIndex = (): number => {
    const lastVisiblePageIndex = pageIdx() + pageStep() - 1;
    let activeIndex = -1;
    tocEntries().forEach((entry, entryIndex) => {
      if (entry.pageIndex <= lastVisiblePageIndex) {
        activeIndex = entryIndex;
      }
    });
    return activeIndex;
  };

  function jumpToTocEntry(entry: TocEntry) {
    setPageIdx(clampPageIndex(entry.pageIndex, total()));
    scrollToTop();
    setTocOpen(false);
  }

  function openToc() {
    setTocOpen(true);
    // The sheet opens scrolled to the top; bring the current chapter into view.
    requestAnimationFrame(() => {
      document.querySelector('.toc-entry.active')?.scrollIntoView({ block: 'center' });
    });
  }

  // Not debounced: called directly (not through `repaginate` below) by the
  // restore sequence, since debouncing it there would let a resize event's
  // `repaginate(...)` call race with, and cancel, the restore's own call.
  function buildAndSetPages(restoreFraction: number) {
    if (!pageEl) {
      return;
    }
    const sections = store.sections[bookId];
    if (!sections?.length) {
      return;
    }

    const built = buildPages({ pageEl, sections, imageAssets: imageAssets() });
    BookStore.updateTotalPages(bookId, built.pages.length);
    batch(() => {
      setLocalPages(built.pages);
      setSectionStartPageIndexes(built.sectionStartPageIndexes);
      const restoredIndex = Math.round(restoreFraction * Math.max(0, built.pages.length - 1));
      setPageIdx(clampPageIndex(restoredIndex, built.pages.length));
      setStage('ready');
    });
  }

  // Debounced because it measures every paragraph on every call, and the
  // delay doubles as time for layout to settle before measuring.
  const repaginate = debounce(buildAndSetPages, RESIZE_DEBOUNCE_MS);

  function paginateOnNextFrame(restoreFraction: number): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        buildAndSetPages(restoreFraction);
        resolve();
      });
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
    onCleanup(() => {
      document.documentElement.lang = originalLang;
    });

    type InitialPosition = { fraction: number; smbPath: string | undefined };

    async function resolveInitialPosition(): Promise<InitialPosition> {
      const startMs = performance.now();
      const best = await resolveBestProgress(bookId);
      console.log(
        `Resolved reading position for book ${bookId} in ${formatDuration(performance.now() - startMs)}`,
      );
      return { fraction: progressFraction(best), smbPath: best?.smbPath };
    }

    async function loadAndParseBook(): Promise<boolean> {
      if (!store.sections[bookId]) {
        setStage('loading');
        const file = await BookFilesDB.download(bookId);
        if (!file) {
          navigate('/');
          return false;
        }
        setStage('parsing');
        const parseStartMs = performance.now();
        const parsed = parseBook({ buffer: file.arrayBuffer, format: file.format });
        console.log(`Parsed book ${bookId} in ${formatDuration(performance.now() - parseStartMs)}`);
        setStore('sections', bookId, parsed.sections);
        setStore('toc', bookId, parsed.toc);
        setStore('notes', bookId, parsed.notes);
        setStore('images', bookId, parsed.images);
      } else {
        setStage('parsing');
      }

      // Must happen before pagination: buildPages() needs image heights.
      const decodeStartMs = performance.now();
      const decodedImageAssets = await decodeImageAssets(store.images[bookId] ?? {});
      console.log(
        `Decoded ${Object.keys(decodedImageAssets).length} images for book ${bookId} in ${formatDuration(
          performance.now() - decodeStartMs,
        )}`,
      );
      setImageAssets(decodedImageAssets);

      const bookLang = book()?.lang;
      if (bookLang) {
        document.documentElement.lang = bookLang;
      }
      return true;
    }

    async function init() {
      // Not awaited yet: loading/parsing the book is normally the slower of
      // the two, so overlapping the wait here means pagination only ever
      // has to happen once, directly at the resolved position.
      const positionPromise = resolveInitialPosition();
      const bookLoaded = await loadAndParseBook();
      if (!bookLoaded) {
        return;
      }
      const position = await positionPromise;
      smbPath = position.smbPath;

      setStage('paginating');
      await paginateOnNextFrame(position.fraction);
    }

    void init();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        if (activeNoteId() || fullscreenImageId() || tocOpen()) {
          return;
        }
        event.preventDefault();
        nextPage();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        if (activeNoteId() || fullscreenImageId() || tocOpen()) {
          return;
        }
        event.preventDefault();
        prevPage();
      } else if (event.key === 'Escape') {
        if (fullscreenImageId()) {
          setFullscreenImageId(null);
        } else if (activeNoteId()) {
          setActiveNoteId(null);
        } else if (tocOpen()) {
          setTocOpen(false);
        } else {
          navigate('/');
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));

    // Drag or rotation may fire a burst of resize events (e.g. on macOS, but
    // not on iOS/iPadOS); repaginate is debounced, so the burst collapses
    // into a single rebuild.
    const handleResize = () => {
      if (stage() !== 'ready') {
        // Reacting here mid-restore would race with, and could cancel,
        // init()'s pending pagination call.
        return;
      }
      const currentFraction = localPages().length > 1 ? pageIdx() / (localPages().length - 1) : 0;
      setStage('paginating');
      repaginate(currentFraction);
    };
    window.addEventListener('resize', handleResize);
    onCleanup(() => {
      repaginate.cancel();
      window.removeEventListener('resize', handleResize);
    });

    // Repagination itself is driven by the resize handler above; this only flips the layout mode.
    const handleDesktopMediaChange = (event: MediaQueryListEvent) => {
      setIsTwoPageView(event.matches);
    };
    desktopMediaQuery.addEventListener('change', handleDesktopMediaChange);
    onCleanup(() => desktopMediaQuery.removeEventListener('change', handleDesktopMediaChange));
  });

  createEffect(() => {
    if (!ready()) {
      return;
    }
    const pageIndex = pageIdx();
    const currentBook = book();
    const total = localPages().length;
    if (!currentBook || total === 0) {
      return;
    }
    const lastVisiblePage = Math.min(pageIndex + pageStep(), total);
    const progress: Progress = {
      bookId,
      bookName: currentBook.name,
      currentPage: pageIndex + 1,
      totalPages: total,
      percent: Math.round((lastVisiblePage / total) * 100),
      lastRead: Date.now(),
      finished: lastVisiblePage >= total,
      smbPath,
    };
    saveProgress(progress);
  });

  function handleContentTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (touch) {
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }
  }

  function handleContentTouchEnd(event: TouchEvent) {
    if (activeNoteId()) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = 2 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (touch.clientX < rect.left + zone) {
      prevPage();
    } else if (touch.clientX > rect.right - zone) {
      nextPage();
    }
  }

  const currentPage = () => localPages()[pageIdx()] ?? [];
  const secondPage = () => localPages()[pageIdx() + 1] ?? [];
  const total = () => localPages().length;
  const lastVisiblePageNumber = () => Math.min(pageIdx() + pageStep(), total());
  const percent = () => (total() > 0 ? Math.round((lastVisiblePageNumber() / total()) * 100) : 0);
  const pageRangeLabel = () => {
    const firstPageNumber = pageIdx() + 1;
    const lastPageNumber = lastVisiblePageNumber();
    return lastPageNumber > firstPageNumber
      ? `${firstPageNumber}-${lastPageNumber}`
      : `${firstPageNumber}`;
  };

  return (
    <div class="reader">
      <div class="reader-header">
        <button
          class="icon-btn"
          onClick={() => navigate('/')}
          title={i18n('reader.backTooltip')}
          aria-label={i18n('reader.backTooltip')}
        >
          <ChevronLeftIcon />
        </button>
        <span class="reader-book-title">{book()?.name ?? ''}</span>
        <Show when={ready()}>
          <span class="reader-page-info">
            {pageRangeLabel()} / {total()}
          </span>
        </Show>
        <button
          class="icon-btn"
          onClick={openToc}
          disabled={!ready() || tocEntries().length === 0}
          title={i18n('reader.tocTooltip')}
          aria-label={i18n('reader.tocTooltip')}
        >
          <TocIcon />
        </button>
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
          title={i18n('reader.previousPage')}
          aria-label={i18n('reader.previousPage')}
        >
          <ChevronLeftIcon />
        </button>
        <button
          class="reader-nav-overlay reader-nav-overlay--next"
          onClick={nextPage}
          disabled={lastVisiblePageNumber() >= total()}
          title={i18n('reader.nextPage')}
          aria-label={i18n('reader.nextPage')}
        >
          <ChevronRightIcon />
        </button>
        <Show when={!ready()}>
          <div class="reader-loading">
            <span class="spinner" />
          </div>
        </Show>
        <div class="reader-pages">
          <div class="reader-page" ref={pageEl}>
            <Show when={ready()}>
              <PageContent
                items={currentPage()}
                imageAssets={imageAssets()}
                onNoteClick={setActiveNoteId}
                onImageOpen={setFullscreenImageId}
              />
            </Show>
          </div>
          <Show when={isTwoPageView()}>
            <div class="reader-page">
              <Show when={ready()}>
                <PageContent
                  items={secondPage()}
                  imageAssets={imageAssets()}
                  onNoteClick={setActiveNoteId}
                  onImageOpen={setFullscreenImageId}
                />
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <div class="reader-footer" style={{ visibility: ready() ? 'visible' : 'hidden' }}>
        <div class="reader-progress-wrap">
          <div
            class="reader-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent()}
          >
            <div class="reader-progress-fill" style={{ width: `${percent()}%` }} />
          </div>
          <div class="reader-percent">{percent()}%</div>
        </div>
      </div>

      <Show when={tocOpen()}>
        <div class="toc-overlay" onClick={() => setTocOpen(false)}>
          <div class="toc-sheet" onClick={(event) => event.stopPropagation()}>
            <div class="toc-header">
              <h2 class="toc-title">{i18n('reader.tocTitle')}</h2>
              <button
                class="icon-btn"
                onClick={() => setTocOpen(false)}
                title={i18n('reader.closeTooltip')}
                aria-label={i18n('reader.ariaCloseToc')}
              >
                <CloseIcon />
              </button>
            </div>
            <ul class="toc-list">
              <For each={tocEntries()}>
                {(entry, entryIndex) => (
                  <li>
                    <button
                      class={`toc-entry${entryIndex() === activeTocEntryIndex() ? ' active' : ''}`}
                      style={{ 'padding-inline-start': `${entry.level * 16}px` }}
                      onClick={() => jumpToTocEntry(entry)}
                    >
                      <span class="toc-entry-title">{entry.title}</span>
                      <span class="toc-entry-page">{entry.pageIndex + 1}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>
      </Show>

      <Show when={fullscreenImage()} keyed>
        {(image) => (
          <div class="image-fullscreen-overlay" onClick={() => setFullscreenImageId(null)}>
            <img
              class="image-fullscreen-picture"
              src={image.dataUrl}
              alt=""
              onClick={(event) => event.stopPropagation()}
            />
            <button
              class="image-fullscreen-close"
              onClick={() => setFullscreenImageId(null)}
              title={i18n('reader.closeTooltip')}
              aria-label={i18n('reader.ariaCloseFullscreenImage')}
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </Show>

      <Show when={activeNote()} keyed>
        {(note) => (
          <div class="note-popup-overlay" onClick={() => setActiveNoteId(null)}>
            <div class="note-popup" onClick={(event) => event.stopPropagation()}>
              <div class="note-popup-content">
                <Show when={note.title}>
                  <h2 class="note-popup-title">{note.title}</h2>
                </Show>
                <p class="note-popup-text">{note.text}</p>
              </div>
              <button
                class="note-popup-close"
                onClick={() => setActiveNoteId(null)}
                aria-label={i18n('reader.ariaCloseNote')}
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
