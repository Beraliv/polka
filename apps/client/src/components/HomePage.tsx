import { createSignal, createMemo, For, Show, onMount } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { LibraryIcon } from './LibraryIcon.tsx';
import { SettingsIcon } from './SettingsIcon.tsx';
import { store, BookStore } from '../store/books.ts';
import { allProgress } from '../lib/progress.ts';
import { parseBook, computeBookId } from '../lib/book';
import { downloadSMBFile } from '../lib/api';
import { loadProgress, saveProgress } from '../lib/progress.ts';
import { BookFilesDB } from '../lib/polka-db.ts';
import { BookCard } from './BookCard.tsx';
import { FileBrowser } from './FileBrowser.tsx';
import type { Book, BookFormat } from '@polka/shared';
import { i18n } from '../i18n';

export function HomePage() {
  const navigate = useNavigate();

  let fileInput!: HTMLInputElement;

  const [adding, setAdding] = createSignal(false);
  const [reopeningId, setReopeningId] = createSignal<string | null>(null);
  const [addError, setAddError] = createSignal('');
  const [showBrowser, setShowBrowser] = createSignal(false);
  const [idbBookIds, setIdbBookIds] = createSignal(new Set<string>());

  onMount(() => {
    void (async () => {
      const available = new Set<string>();
      await Promise.all(store.books.map(async (book) => {
        if (await BookFilesDB.has(book.id)) {
          available.add(book.id);
        }
      }));
      setIdbBookIds(available);
    })();
  });

  const progressMap = createMemo(() => {
    const map: Record<string, ReturnType<typeof allProgress>[number]> = {};
    for (const progressEntry of allProgress()) map[progressEntry.bookId] = progressEntry;
    return map;
  });

  const activeBooks = createMemo(() =>
    store.books.filter((book) => !progressMap()[book.id]?.finished)
  );

  const finishedBooks = createMemo(() =>
    store.books.filter((book) => !!progressMap()[book.id]?.finished)
  );

  function processBook(buffer: ArrayBuffer, filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() as BookFormat;
    const bookId = computeBookId(buffer);
    const parsed = parseBook({ buffer, format: extension });
    const book: Book = {
      id: bookId,
      name: parsed.title || filename,
      author: parsed.author,
      lang: parsed.lang,
      format: extension,
      totalPages: 0,
      addedAt: Date.now(),
    };
    void BookStore.uploadBook({
      book,
      sections: parsed.sections,
      notes: parsed.notes,
      images: parsed.images,
      arrayBuffer: buffer,
    });
    setIdbBookIds((prev) => new Set([...prev, bookId]));
    return bookId;
  }

  async function handleFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!/\.(epub|fb2)$/i.test(file.name)) {
      setAddError(i18n('home.unsupportedFormatError'));
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const buffer = await file.arrayBuffer();
      const bookId = processBook(buffer, file.name);
      navigate(`/reader/${bookId}`);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
      fileInput.value = '';
    }
  }

  async function handleSMBSelect(path: string, filename: string) {
    if (!store.smb) return;
    setShowBrowser(false);
    setAdding(true);
    setAddError('');
    try {
      const buffer = await downloadSMBFile(store.smb, path);
      const bookId = processBook(buffer, filename);
      // Persist SMB path so re-download is possible after reload
      const previousProgress = loadProgress(bookId);
      saveProgress({
        bookId,
        bookName: previousProgress?.bookName ?? filename,
        currentPage: previousProgress?.currentPage ?? 0,
        totalPages: previousProgress?.totalPages ?? 0,
        percent: previousProgress?.percent ?? 0,
        lastRead: previousProgress?.lastRead ?? Date.now(),
        finished: previousProgress?.finished ?? false,
        smbPath: path,
      });
      navigate(`/reader/${bookId}`);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  }

  function openBook(bookId: string) {
    setAddError('');
    navigate(`/reader/${bookId}`);
  }

  async function reopenBook(bookId: string) {
    if (!store.smb) {
      setAddError(i18n('home.missingSmbConfigError'));
      return;
    }

    const progress = loadProgress(bookId);
    if (!progress?.smbPath) {
      setAddError(
        i18n('home.missingSmbPathError', {
          addFromDevice: i18n('home.addFromDeviceButton'),
          addFromNas: i18n('home.addFromNasButton'),
        }),
      );
      return;
    }

    setReopeningId(bookId);
    setAddError('');
    try {
      const filename = progress.smbPath.split('\\').pop() ?? progress.smbPath;
      const buffer = await downloadSMBFile(store.smb, progress.smbPath);
      processBook(buffer, filename);
      navigate(`/reader/${bookId}`);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setReopeningId(null);
    }
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">{i18n('home.appTitle')}</h1>
        <A
          href="/settings"
          class="icon-btn"
          title={i18n('home.settingsTooltip')}
          aria-label={i18n('home.settingsTooltip')}
        >
          <SettingsIcon />
        </A>
      </div>

      <Show when={adding()}>
        <div class="loading-center"><span class="spinner" /></div>
      </Show>

      <Show when={addError()}>
        <p class="error-text">{addError()}</p>
      </Show>

      <Show when={store.books.length === 0 && !adding()}>
        <div class="empty-state">
          <div class="empty-state-icon"><LibraryIcon /></div>
          <p class="empty-state-text">
            {i18n('home.emptyStateText', {
              addFromDevice: i18n('home.addFromDeviceButton'),
              addFromNas: i18n('home.addFromNasButton'),
            })}
          </p>
        </div>
      </Show>

      <Show when={activeBooks().length > 0}>
        <div class="shelf">
          <div class="shelf-heading">{i18n('home.readingShelfHeading')}</div>
          <For each={activeBooks()}>
            {(book) => (
              <BookCard
                book={book}
                progress={progressMap()[book.id]}
                available={!!store.sections[book.id] || idbBookIds().has(book.id)}
                onOpen={() => openBook(book.id)}
                onReopen={() => void reopenBook(book.id)}
                loading={reopeningId() === book.id}
                onRemove={() => void BookStore.deleteBook(book.id)}
              />
            )}
          </For>
        </div>
      </Show>

      <Show when={finishedBooks().length > 0}>
        <div class="shelf" style={{ 'margin-top': '16px' }}>
          <div class="shelf-heading">{i18n('home.finishedShelfHeading')}</div>
          <For each={finishedBooks()}>
            {(book) => (
              <BookCard
                book={book}
                progress={progressMap()[book.id]}
                available={!!store.sections[book.id] || idbBookIds().has(book.id)}
                onOpen={() => openBook(book.id)}
                onReopen={() => void reopenBook(book.id)}
                loading={reopeningId() === book.id}
                onRemove={() => void BookStore.deleteBook(book.id)}
              />
            )}
          </For>
        </div>
      </Show>

      <input
        ref={fileInput}
        type="file"
        accept=".epub,.fb2"
        style={{ display: 'none' }}
        onChange={(event) => void handleFileChange(event)}
      />

      <div class="fab-area">
        <Show when={store.smb}>
          <button class="smb-btn" onClick={() => setShowBrowser(true)}>
            {i18n('home.addFromNasButton')}
          </button>
        </Show>
        <button
          class="smb-btn"
          onClick={() => fileInput.click()}
          disabled={adding()}
        >
          {adding() ? '…' : i18n('home.addFromDeviceButton')}
        </button>
      </div>

      <Show when={showBrowser() && store.smb}>
        <FileBrowser
          config={store.smb!}
          onClose={() => setShowBrowser(false)}
          onSelect={(path, filename) => void handleSMBSelect(path, filename)}
        />
      </Show>
    </div>
  );
}
