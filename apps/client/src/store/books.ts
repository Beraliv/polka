import { createStore } from 'solid-js/store';
import type { Book, SMBConfig } from '@polka/shared';
import type { SectionItem, Note } from '../lib/paginate.ts';

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
  sections: {} as Record<string, SectionItem[]>,
  notes: {} as Record<string, Record<string, Note>>,
});

export { store };

type AddBookOptions = { book: Book; sections: SectionItem[]; notes?: Record<string, Note> };

export function addBook({ book, sections, notes }: AddBookOptions): void {
  setStore('books', (prev) => {
    const next = [book, ...prev.filter((b) => b.id !== book.id)];
    localStorage.setItem(BOOKS_KEY, JSON.stringify(next));
    return next;
  });
  setStore('sections', book.id, sections);
  if (notes) setStore('notes', book.id, notes);
}

export function updateBookTotalPages(id: string, totalPages: number): void {
  setStore('books', (prev) => {
    const next = prev.map((b) => (b.id === id ? { ...b, totalPages } : b));
    localStorage.setItem(BOOKS_KEY, JSON.stringify(next));
    return next;
  });
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
