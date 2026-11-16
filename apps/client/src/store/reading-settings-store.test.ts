// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_READING_SETTINGS } from '../lib/reading-settings.ts';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('BookStore reading settings', () => {
  it('starts from the defaults when nothing is stored', async () => {
    const { store } = await import('./books.ts');

    expect(store.readingSettings).toEqual(DEFAULT_READING_SETTINGS);
  });

  it('loads a stored value through the normaliser', async () => {
    localStorage.setItem(
      'polka:reading-settings',
      JSON.stringify({ font: 'montserrat', lineSpacing: 99, theme: 'sepia' }),
    );

    const { store } = await import('./books.ts');

    expect(store.readingSettings.font).toBe('montserrat');
    expect(store.readingSettings.lineSpacing).toBe(2.5);
    expect(store.readingSettings.theme).toBe(DEFAULT_READING_SETTINGS.theme);
  });

  it('saves the whole object in one write, so a reset is a single change', async () => {
    const { store, BookStore } = await import('./books.ts');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    BookStore.saveReadingSettings({ ...DEFAULT_READING_SETTINGS, size: 'xl', margins: 'large' });
    BookStore.saveReadingSettings(DEFAULT_READING_SETTINGS);

    expect(setItemSpy).toHaveBeenCalledTimes(2);
    expect(store.readingSettings).toEqual(DEFAULT_READING_SETTINGS);
    expect(JSON.parse(localStorage.getItem('polka:reading-settings')!)).toEqual(
      DEFAULT_READING_SETTINGS,
    );
  });
});
