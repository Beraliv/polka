import { store } from '../../store/books.ts';

export function apiUrl(path: string, serverUrl = store.serverUrl): string {
  return `${serverUrl}${path}`;
}
