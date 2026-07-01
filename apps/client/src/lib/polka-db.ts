import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Progress, BookFormat } from '@polka/shared';

export type BookFileEntry = { arrayBuffer: ArrayBuffer; format: BookFormat };

type PolkaDB = {
  bookFiles: { key: string; value: BookFileEntry };
  progress: { key: string; value: Progress };
};

let dbPromise: Promise<IDBPDatabase<PolkaDB>> | null = null;

function getDB(): Promise<IDBPDatabase<PolkaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PolkaDB>('polka', 1, {
      upgrade(db) {
        db.createObjectStore('bookFiles');
        db.createObjectStore('progress');
      },
    });
  }
  return dbPromise;
}

export class BookFilesDB {
  static async upload(bookId: string, entry: BookFileEntry): Promise<void> {
    const db = await getDB();
    await db.put('bookFiles', entry, bookId);
  }

  static async download(bookId: string): Promise<BookFileEntry | undefined> {
    const db = await getDB();
    return db.get('bookFiles', bookId);
  }

  static async has(bookId: string): Promise<boolean> {
    const db = await getDB();
    const key = await db.getKey('bookFiles', bookId);
    return key !== undefined;
  }

  static async delete(bookId: string): Promise<void> {
    const db = await getDB();
    await db.delete('bookFiles', bookId);
  }
}

export class ProgressDB {
  static async upload(progress: Progress): Promise<void> {
    const db = await getDB();
    await db.put('progress', progress, progress.bookId);
  }

  static async download(): Promise<Progress[]> {
    const db = await getDB();
    return db.getAll('progress');
  }

  static async delete(bookId: string): Promise<void> {
    const db = await getDB();
    await db.delete('progress', bookId);
  }
}