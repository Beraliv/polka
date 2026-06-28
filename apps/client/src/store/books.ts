import { createStore } from 'solid-js/store';
import type { Book, SMBConfig } from '@polka/shared';
import type { Page } from '../lib/paginate.ts';

const BOOKS_KEY = 'polka:books';
const SMB_KEY = 'polka:smb';

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
  pages: {} as Record<string, Page[]>,
});

export { store };

export function addBook(book: Book, pages: Page[]): void {
  setStore('books', (prev) => {
    const next = [book, ...prev.filter((b) => b.id !== book.id)];
    localStorage.setItem(BOOKS_KEY, JSON.stringify(next));
    return next;
  });
  setStore('pages', book.id, pages);
}

export function removeBook(id: string): void {
  setStore('books', (prev) => {
    const next = prev.filter((b) => b.id !== id);
    localStorage.setItem(BOOKS_KEY, JSON.stringify(next));
    return next;
  });
}

export function setSMB(config: SMBConfig): void {
  localStorage.setItem(SMB_KEY, JSON.stringify(config));
  setStore('smb', config);
}

export function clearSMB(): void {
  localStorage.removeItem(SMB_KEY);
  setStore('smb', null);
}
