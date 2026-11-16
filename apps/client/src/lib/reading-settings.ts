export type ReadingTheme = 'white' | 'light' | 'dark' | 'black';
export type ReadingFont =
  | 'georgia'
  | 'times'
  | 'sanFrancisco'
  | 'newYork'
  | 'publico'
  | 'montserrat';
export type ReadingSize = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ReadingMargins = 'small' | 'normal' | 'large';

export interface ReadingSettings {
  theme: ReadingTheme;
  font: ReadingFont;
  size: ReadingSize;
  lineSpacing: number;
  margins: ReadingMargins;
  justifyText: boolean;
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  theme: 'dark',
  font: 'georgia',
  size: 'm',
  lineSpacing: 1.85,
  margins: 'normal',
  justifyText: true,
};

export const LINE_SPACING_MIN = 0.8;
export const LINE_SPACING_MAX = 2.5;
// A 0.05 step is needed so the default 1.85 sits on the slider. Stepping
// 0.8 + n × 0.1 never reaches it.
const LINE_SPACING_STEPS_PER_UNIT = 20;
export const LINE_SPACING_STEP = 1 / LINE_SPACING_STEPS_PER_UNIT;

export const READING_THEMES: readonly ReadingTheme[] = ['white', 'light', 'dark', 'black'];
export const READING_FONTS: readonly ReadingFont[] = [
  'georgia',
  'times',
  'sanFrancisco',
  'newYork',
  'publico',
  'montserrat',
];
export const READING_SIZES: readonly ReadingSize[] = ['xs', 's', 'm', 'l', 'xl'];
export const READING_MARGINS: readonly ReadingMargins[] = ['small', 'normal', 'large'];

// Muted and surface colours are chosen per theme rather than mixed from the
// text colour, so the dark theme keeps the exact values the app has always used.
const THEME_COLOURS: Record<
  ReadingTheme,
  {
    background: string;
    text: string;
    muted: string;
    surface: string;
    border: string;
    navigationHover: string;
  }
> = {
  white: {
    background: '#ffffff',
    text: '#1a1a1a',
    muted: '#6b6b6b',
    surface: '#f1f1f1',
    border: '#dcdcdc',
    navigationHover: '#e5e5e5',
  },
  light: {
    background: '#f4f1ea',
    text: '#2b2b2b',
    muted: '#7a7468',
    surface: '#e9e4d8',
    border: '#d6cfbf',
    navigationHover: '#e4ddcc',
  },
  dark: {
    background: '#0f172a',
    text: '#f1f5f9',
    muted: '#94a3b8',
    surface: '#1e293b',
    border: '#334155',
    navigationHover: '#303030',
  },
  black: {
    background: '#000000',
    text: '#e5e5e5',
    muted: '#8a8a8a',
    surface: '#141414',
    border: '#2a2a2a',
    navigationHover: '#1c1c1c',
  },
};

// `ui-serif` is a CSS generic that resolves to New York on Apple platforms.
// Publico is proprietary, so it uses Source Serif 4, which ships with the app.
const FONT_STACKS: Record<ReadingFont, string> = {
  georgia: "Georgia, 'Times New Roman', serif",
  times: "'Times New Roman', Times, serif",
  sanFrancisco: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  newYork: 'ui-serif, Georgia, serif',
  publico: "'Source Serif 4', Georgia, serif",
  montserrat: 'Montserrat, sans-serif',
};

const SIZE_REMS: Record<ReadingSize, { mobile: string; desktop: string }> = {
  xs: { mobile: '0.85rem', desktop: '0.85rem' },
  s: { mobile: '0.95rem', desktop: '0.95rem' },
  m: { mobile: '1.05rem', desktop: '1.1rem' },
  l: { mobile: '1.2rem', desktop: '1.2rem' },
  xl: { mobile: '1.4rem', desktop: '1.4rem' },
};

const MARGIN_PADDINGS: Record<
  ReadingMargins,
  {
    mobileVertical: string;
    mobileHorizontal: string;
    desktopVertical: string;
    desktopHorizontal: string;
  }
> = {
  small: {
    mobileVertical: '0.5rem',
    mobileHorizontal: '1rem',
    desktopVertical: '16px',
    desktopHorizontal: '32px',
  },
  normal: {
    mobileVertical: '0.75rem',
    mobileHorizontal: '2rem',
    desktopVertical: '32px',
    desktopHorizontal: '64px',
  },
  large: {
    mobileVertical: '1rem',
    mobileHorizontal: '3rem',
    desktopVertical: '48px',
    desktopHorizontal: '96px',
  },
};

export function readingFontFamily(font: ReadingFont): string {
  return FONT_STACKS[font];
}

/**
 * Turns settings into the CSS custom properties that the reader's styles read.
 * The reader and the Settings previews both apply this output, so a preview
 * can't drift from the real page.
 */
export function readingStyleProperties(settings: ReadingSettings): Record<string, string> {
  const colours = THEME_COLOURS[settings.theme];
  const size = SIZE_REMS[settings.size];
  const margins = MARGIN_PADDINGS[settings.margins];
  return {
    '--reader-background': colours.background,
    '--reader-text': colours.text,
    '--reader-muted': colours.muted,
    '--reader-surface': colours.surface,
    '--reader-border': colours.border,
    '--reader-navigation-hover': colours.navigationHover,
    '--reader-font-family': readingFontFamily(settings.font),
    '--reader-font-size-mobile': size.mobile,
    '--reader-font-size-desktop': size.desktop,
    '--reader-line-height': String(settings.lineSpacing),
    '--reader-margin-mobile-vertical': margins.mobileVertical,
    '--reader-margin-mobile-horizontal': margins.mobileHorizontal,
    '--reader-margin-desktop-vertical': margins.desktopVertical,
    '--reader-margin-desktop-horizontal': margins.desktopHorizontal,
    '--reader-text-align': settings.justifyText ? 'justify' : 'left',
  };
}

function pickOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function normalizeLineSpacing(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_READING_SETTINGS.lineSpacing;
  }
  const clamped = Math.min(LINE_SPACING_MAX, Math.max(LINE_SPACING_MIN, value));
  // Dividing an integer by the steps-per-unit gives the nearest double to the
  // decimal, so 37 / 20 is exactly the 1.85 literal. Multiplying by the step
  // would give 1.8500000000000003 instead.
  return Math.round(clamped * LINE_SPACING_STEPS_PER_UNIT) / LINE_SPACING_STEPS_PER_UNIT;
}

/**
 * Accepts whatever was stored in localStorage. Missing or unknown fields fall
 * back to their defaults, so a partial or corrupt value can't break the reader.
 */
export function normalizeReadingSettings(stored: unknown): ReadingSettings {
  const source: Partial<Record<keyof ReadingSettings, unknown>> =
    typeof stored === 'object' && stored !== null ? stored : {};
  return {
    theme: pickOption(source.theme, READING_THEMES, DEFAULT_READING_SETTINGS.theme),
    font: pickOption(source.font, READING_FONTS, DEFAULT_READING_SETTINGS.font),
    size: pickOption(source.size, READING_SIZES, DEFAULT_READING_SETTINGS.size),
    lineSpacing: normalizeLineSpacing(source.lineSpacing),
    margins: pickOption(source.margins, READING_MARGINS, DEFAULT_READING_SETTINGS.margins),
    justifyText:
      typeof source.justifyText === 'boolean'
        ? source.justifyText
        : DEFAULT_READING_SETTINGS.justifyText,
  };
}

export function areReadingSettingsEqual(first: ReadingSettings, second: ReadingSettings): boolean {
  return (
    first.theme === second.theme &&
    first.font === second.font &&
    first.size === second.size &&
    first.lineSpacing === second.lineSpacing &&
    first.margins === second.margins &&
    first.justifyText === second.justifyText
  );
}
