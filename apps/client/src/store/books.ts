import { createStore } from 'solid-js/store';
import type { Book, SMBConfig } from '@polka/shared';
import type { SectionItem, Note } from '../lib/book';
import { BookFilesDB, ProgressDB } from '../lib/polka-db.ts';

const BOOKS_KEY = 'polka:books';
const SMB_KEY = 'polka:smb';
const SERVER_URL_KEY = 'polka:server-url';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const [store, setStore] = createStore({
  books: load<Book[]>(BOOKS_KEY, []),
  smb: load<SMBConfig | null>(SMB_KEY, null),
  serverUrl: load<string>(SERVER_URL_KEY, ''),
  sections: {} as Record<string, SectionItem[]>,
  notes: {} as Record<string, Record<string, Note>>,
  // Book image data URLs keyed by book id, then by image id.
  images: {} as Record<string, Record<string, string>>,
});

export { store, setStore };

type AddBookOptions = {
  book: Book;
  sections: SectionItem[];
  notes?: Record<string, Note>;
  images?: Record<string, string>;
  arrayBuffer: ArrayBuffer;
};

export class BookStore {
  static async uploadBook({ book, sections, notes, images, arrayBuffer }: AddBookOptions): Promise<void> {
    setStore('books', (previousBooks) => {
      const nextBooks = [book, ...previousBooks.filter((storedBook) => storedBook.id !== book.id)];
      try {
        localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
      } catch (error) {
        console.error(`[uploadBook] Failed to upload book ${book.id} to local storage:`, error);
      }
      return nextBooks;
    });
    setStore('sections', book.id, sections);
    if (notes) {
      setStore('notes', book.id, notes);
    }
    setStore('images', book.id, images ?? {});
    try {
      await BookFilesDB.upload(book.id, { arrayBuffer, format: book.format });
      console.log(`[uploadBook] Successfully uploaded book ${book.id} to IndexedDB`);
    } catch (error) {
      console.error(`[uploadBook] Failed to upload book ${book.id} to IndexedDB:`, error);
    }
  }

  static updateTotalPages(id: string, totalPages: number): void {
    setStore('books', (previousBooks) => {
      const nextBooks = previousBooks.map((storedBook) => (storedBook.id === id ? { ...storedBook, totalPages } : storedBook));
      try {
        localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
      } catch (error) {
        console.error(`[updateTotalPages] Failed to update total pages for book ${id} in local storage:`, error);
      }
      return nextBooks;
    });
  }

  static async deleteBook(id: string): Promise<void> {
    setStore('books', (previousBooks) => {
      const nextBooks = previousBooks.filter((storedBook) => storedBook.id !== id);
      try {
        localStorage.setItem(BOOKS_KEY, JSON.stringify(nextBooks));
      } catch (error) {
        console.error(`[deleteBook] Failed to delete book ${id} from local storage:`, error);
      }
      return nextBooks;
    });
    try {
      const [bookFilesResult, progressResult] = await Promise.allSettled([
        BookFilesDB.delete(id),
        ProgressDB.delete(id),
      ]);
      if (bookFilesResult.status === 'rejected') {
        console.error(`[deleteBook] Failed to delete book files from IndexedDB for ${id}:`, bookFilesResult.reason);
      } else if (progressResult.status === 'rejected') {
        console.error(`[deleteBook] Failed to delete progress from IndexedDB for ${id}:`, progressResult.reason);
      } else {
        console.log(`[deleteBook] Successfully deleted book ${id} from IndexedDB.`);
      }
    } catch (error) {
      console.error(`[deleteBook] Failed to delete book ${id} from IndexedDB:`, error);
    }
  }

  static saveServerUrl(url: string): void {
    const trimmed = url.trim().replace(/\/+$/, '');
    try {
      localStorage.setItem(SERVER_URL_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error('[saveServerUrl] Failed to save server URL to local storage:', error);
    }
    setStore('serverUrl', trimmed);
  }

  static deleteServerUrl(): void {
    try {
      localStorage.removeItem(SERVER_URL_KEY);
    } catch (error) {
      console.error('[deleteServerUrl] Failed to delete server URL from local storage:', error);
    }
    setStore('serverUrl', '');
  }

  static saveSMBConfig(config: SMBConfig): void {
    try {
      localStorage.setItem(SMB_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('[saveSMBConfig] Failed to save SMB config to local storage:', error);
    }
    setStore('smb', config);
  }

  static deleteSMBConfig(): void {
    try {
      localStorage.removeItem(SMB_KEY);
    } catch (error) {
      console.error('[deleteSMBConfig] Failed to delete SMB config from local storage:', error);
    }
    setStore('smb', null);
  }
}
