import { createSignal, createMemo, For, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { store, addBook, removeBook } from '../store/books.ts';
import { allProgress } from '../lib/progress.ts';
import { parseEPUB } from '../lib/epub.ts';
import { parseFB2 } from '../lib/fb2.ts';
import { paginate } from '../lib/paginate.ts';
import { computeBookId } from '../lib/bookId.ts';
import { downloadSMBFile } from '../lib/api.ts';
import { BookCard } from './BookCard.tsx';
import { FileBrowser } from './FileBrowser.tsx';
import type { Book, BookFormat } from '@polka/shared';

export function HomePage() {
  const navigate = useNavigate();

  let fileInput!: HTMLInputElement;

  const [adding, setAdding] = createSignal(false);
  const [addError, setAddError] = createSignal('');
  const [showBrowser, setShowBrowser] = createSignal(false);

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

  async function processBook(buffer: ArrayBuffer, filename: string): Promise<string> {
    const ext = filename.split('.').pop()?.toLowerCase() as BookFormat;
    const bookId = await computeBookId(buffer);
    const parsed = ext === 'epub' ? parseEPUB(buffer) : parseFB2(buffer);
    const pages = paginate(parsed.paragraphs);
    const book: Book = {
      id: bookId,
      name: parsed.title || filename,
      author: parsed.author,
      format: ext,
      totalPages: pages.length,
      addedAt: Date.now(),
    };
    addBook(book, pages);
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
      const bookId = await processBook(buffer, file.name);
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
      const bookId = await processBook(buffer, filename);
      navigate(`/reader/${bookId}`);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  function openBook(bookId: string) {
    if (!store.pages[bookId]) {
      setAddError('Re-open this book using "+" or "Browse NAS" to continue reading');
      return;
    }
    setAddError('');
    navigate(`/reader/${bookId}`);
  }

  return (
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Polka</h1>
        <A href="/settings" class="icon-btn" title="Settings">⚙</A>
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
                available={!!store.pages[book.id]}
                onOpen={() => openBook(book.id)}
                onRemove={() => removeBook(book.id)}
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
                available={!!store.pages[book.id]}
                onOpen={() => openBook(book.id)}
                onRemove={() => removeBook(book.id)}
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
          class="fab"
          onClick={() => fileInput.click()}
          title="Open local book"
          disabled={adding()}
        >
          {adding() ? '…' : '+'}
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
