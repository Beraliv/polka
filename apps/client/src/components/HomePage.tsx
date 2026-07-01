import { createSignal, createMemo, For, Show, onMount } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { store, BookStore } from '../store/books.ts';
import { allProgress } from '../lib/progress.ts';
import { parseEPUB } from '../lib/epub.ts';
import { parseFB2 } from '../lib/fb2.ts';
import { computeBookId } from '../lib/bookId.ts';
import { downloadSMBFile } from '../lib/api.ts';
import { loadProgress, saveProgress } from '../lib/progress.ts';
import { BookFilesDB } from '../lib/polka-db.ts';
import { BookCard } from './BookCard.tsx';
import { FileBrowser } from './FileBrowser.tsx';
import type { Book, BookFormat } from '@polka/shared';

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
      await Promise.all(store.books.map(async (b) => {
        if (await BookFilesDB.has(b.id)) {
          available.add(b.id);
        }
      }));
      setIdbBookIds(available);
    })();
  });

  const progressMap = createMemo(() => {
    const map: Record<string, ReturnType<typeof allProgress>[number]> = {};
    for (const p of allProgress()) map[p.bookId] = p;
    return map;
  });

  const activeBooks = createMemo(() =>
    store.books.filter((b) => !progressMap()[b.id]?.finished)
  );

  const finishedBooks = createMemo(() =>
    store.books.filter((b) => !!progressMap()[b.id]?.finished)
  );

  function processBook(buffer: ArrayBuffer, filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() as BookFormat;
    const bookId = computeBookId(buffer);
    const parsed = ext === 'epub' ? parseEPUB(buffer) : parseFB2(buffer);
    const book: Book = {
      id: bookId,
      name: parsed.title || filename,
      author: parsed.author,
      lang: parsed.lang,
      format: ext,
      totalPages: 0,
      addedAt: Date.now(),
    };
    void BookStore.uploadBook({ book, sections: parsed.sections, notes: parsed.notes, arrayBuffer: buffer });
    setIdbBookIds((prev) => new Set([...prev, bookId]));
    return bookId;
  }

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!/\.(epub|fb2)$/i.test(file.name)) {
      setAddError('Only EPUB and FB2 files are supported');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const buffer = await file.arrayBuffer();
      const bookId = processBook(buffer, file.name);
      navigate(`/reader/${bookId}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
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
      const prev = loadProgress(bookId);
      saveProgress({
        bookId,
        bookName: prev?.bookName ?? filename,
        currentPage: prev?.currentPage ?? 0,
        totalPages: prev?.totalPages ?? 0,
        percent: prev?.percent ?? 0,
        lastRead: prev?.lastRead ?? Date.now(),
        finished: prev?.finished ?? false,
        smbPath: path,
      });
      navigate(`/reader/${bookId}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
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
      setAddError('No SMB configuration found. Add your NAS credentials using "Browser NAS" and re-open this book to continue reading');
      return;
    }

    const progress = loadProgress(bookId);
    if (!progress?.smbPath) {
      setAddError('Re-open this book using "+" or "Browse NAS" to continue reading');
      return;
    }

    setReopeningId(bookId);
    setAddError('');
    try {
      const filename = progress.smbPath.split('\\').pop() ?? progress.smbPath;
      const buffer = await downloadSMBFile(store.smb, progress.smbPath);
      processBook(buffer, filename);
      navigate(`/reader/${bookId}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setReopeningId(null);
    }
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Polka</h1>
        <A href="/settings" class="icon-btn" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
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
          <div class="empty-state-icon">📚</div>
          <p class="empty-state-text">No books yet — tap + to add one</p>
        </div>
      </Show>

      <Show when={activeBooks().length > 0}>
        <div class="shelf">
          <div class="shelf-heading">Reading</div>
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
          <div class="shelf-heading">Finished</div>
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
        onChange={(e) => void handleFileChange(e)}
      />

      <div class="fab-area">
        <Show when={store.smb}>
          <button class="smb-btn" onClick={() => setShowBrowser(true)}>
            Browse NAS
          </button>
        </Show>
        <button
          class="smb-btn"
          onClick={() => fileInput.click()}
          disabled={adding()}
        >
          {adding() ? '…' : 'Browse files'}
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
