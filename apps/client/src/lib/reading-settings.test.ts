import { describe, expect, it } from 'vitest';
import {
  areReadingSettingsEqual,
  DEFAULT_READING_SETTINGS,
  normalizeReadingSettings,
  readingStyleProperties,
} from './reading-settings.ts';

describe('normalizeReadingSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(normalizeReadingSettings(null)).toEqual(DEFAULT_READING_SETTINGS);
    expect(normalizeReadingSettings('not an object')).toEqual(DEFAULT_READING_SETTINGS);
  });

  it('keeps the current reader line spacing exactly, so the default is not rounded away', () => {
    expect(normalizeReadingSettings({ lineSpacing: 1.85 }).lineSpacing).toBe(1.85);
  });

  it('falls back field by field, so one bad value does not reset the others', () => {
    const normalized = normalizeReadingSettings({ theme: 'sepia', font: 'montserrat' });

    expect(normalized.theme).toBe(DEFAULT_READING_SETTINGS.theme);
    expect(normalized.font).toBe('montserrat');
  });

  it('clamps line spacing to the slider range and rejects non-numbers', () => {
    expect(normalizeReadingSettings({ lineSpacing: 9 }).lineSpacing).toBe(2.5);
    expect(normalizeReadingSettings({ lineSpacing: 0.1 }).lineSpacing).toBe(0.8);
    expect(normalizeReadingSettings({ lineSpacing: '2' }).lineSpacing).toBe(
      DEFAULT_READING_SETTINGS.lineSpacing,
    );
    expect(normalizeReadingSettings({ lineSpacing: Number.NaN }).lineSpacing).toBe(
      DEFAULT_READING_SETTINGS.lineSpacing,
    );
  });

  it('accepts only a boolean for justification', () => {
    expect(normalizeReadingSettings({ justifyText: false }).justifyText).toBe(false);
    expect(normalizeReadingSettings({ justifyText: 'no' }).justifyText).toBe(true);
  });
});

describe('readingStyleProperties', () => {
  it('reproduces the reader styles that existed before the settings', () => {
    const properties = readingStyleProperties(DEFAULT_READING_SETTINGS);

    expect(properties).toMatchObject({
      '--reader-background': '#0f172a',
      '--reader-text': '#f1f5f9',
      '--reader-font-family': "Georgia, 'Times New Roman', serif",
      '--reader-font-size-mobile': '1.05rem',
      '--reader-font-size-desktop': '1.1rem',
      '--reader-line-height': '1.85',
      '--reader-margin-mobile-vertical': '0.75rem',
      '--reader-margin-mobile-horizontal': '2rem',
      '--reader-margin-desktop-vertical': '32px',
      '--reader-margin-desktop-horizontal': '64px',
      '--reader-text-align': 'justify',
    });
  });

  it('turns justification off into left alignment', () => {
    const properties = readingStyleProperties({
      ...DEFAULT_READING_SETTINGS,
      justifyText: false,
    });

    expect(properties['--reader-text-align']).toBe('left');
  });

  it('uses the bundled Publico substitute rather than a stack that falls back to Georgia', () => {
    const properties = readingStyleProperties({ ...DEFAULT_READING_SETTINGS, font: 'publico' });

    expect(properties['--reader-font-family']).toBe("'Source Serif 4', Georgia, serif");
  });
});

describe('areReadingSettingsEqual', () => {
  it('compares every field', () => {
    expect(areReadingSettingsEqual(DEFAULT_READING_SETTINGS, { ...DEFAULT_READING_SETTINGS })).toBe(
      true,
    );
    expect(
      areReadingSettingsEqual(DEFAULT_READING_SETTINGS, { ...DEFAULT_READING_SETTINGS, size: 'l' }),
    ).toBe(false);
  });
});
