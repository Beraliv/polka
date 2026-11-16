import { For } from 'solid-js';
import { BookStore, store } from '../../store/books.ts';
import { i18n, type KeyWithoutPlaceholders } from '../../i18n';
import {
  areReadingSettingsEqual,
  DEFAULT_READING_SETTINGS,
  LINE_SPACING_MAX,
  LINE_SPACING_MIN,
  LINE_SPACING_STEP,
  READING_FONTS,
  READING_MARGINS,
  READING_SIZES,
  READING_THEMES,
  readingFontFamily,
  readingStyleProperties,
  type ReadingFont,
  type ReadingMargins,
  type ReadingSettings,
  type ReadingSize,
  type ReadingTheme,
} from '../../lib/reading-settings.ts';

const THEME_LABEL_KEYS: Record<ReadingTheme, KeyWithoutPlaceholders> = {
  white: 'readingSettings.themeWhite',
  light: 'readingSettings.themeLight',
  dark: 'readingSettings.themeDark',
  black: 'readingSettings.themeBlack',
};

const FONT_LABEL_KEYS: Record<ReadingFont, KeyWithoutPlaceholders> = {
  georgia: 'readingSettings.fontGeorgia',
  times: 'readingSettings.fontTimes',
  sanFrancisco: 'readingSettings.fontSanFrancisco',
  newYork: 'readingSettings.fontNewYork',
  publico: 'readingSettings.fontPublico',
  montserrat: 'readingSettings.fontMontserrat',
};

const SIZE_LABEL_KEYS: Record<ReadingSize, KeyWithoutPlaceholders> = {
  xs: 'readingSettings.sizeXs',
  s: 'readingSettings.sizeS',
  m: 'readingSettings.sizeM',
  l: 'readingSettings.sizeL',
  xl: 'readingSettings.sizeXl',
};

const MARGINS_LABEL_KEYS: Record<ReadingMargins, KeyWithoutPlaceholders> = {
  small: 'readingSettings.marginsSmall',
  normal: 'readingSettings.marginsNormal',
  large: 'readingSettings.marginsLarge',
};

interface ChoiceOption<Value extends string> {
  value: Value;
  label: string;
  fontFamily?: string;
}

interface ChoiceListProps<Value extends string> {
  name: string;
  legend: string;
  options: ChoiceOption<Value>[];
  selected: Value;
  onSelect: (value: Value) => void;
}

// The radio pattern matches ExplanationSettings: a labelled list of rows, the
// whole row clickable.
function ChoiceList<Value extends string>(props: ChoiceListProps<Value>) {
  return (
    <ul class="settings-menu" role="radiogroup" aria-label={props.legend}>
      <For each={props.options}>
        {(option) => (
          <li>
            <label class="settings-menu-item settings-option">
              <span style={option.fontFamily ? { 'font-family': option.fontFamily } : undefined}>
                {option.label}
              </span>
              <input
                type="radio"
                name={props.name}
                value={option.value}
                checked={props.selected === option.value}
                onChange={() => props.onSelect(option.value)}
              />
            </label>
          </li>
        )}
      </For>
    </ul>
  );
}

// Every section shows this preview above its control, so the effect of the
// control is visible before the page is left. It uses the reader's own
// classes and custom properties, so it renders like the real page.
function ReadingPreview() {
  return (
    <div
      class="reading-preview reading-theme"
      style={readingStyleProperties(store.readingSettings)}
    >
      <div class="reader-content reading-preview-content">
        <h3 class="reader-section-title">{i18n('readingSettings.previewChapterTitle')}</h3>
        <p class="reader-paragraph no-indent">{i18n('readingSettings.previewParagraphOne')}</p>
        <p class="reader-paragraph">{i18n('readingSettings.previewParagraphTwo')}</p>
      </div>
    </div>
  );
}

function updateReadingSettings(change: Partial<ReadingSettings>): void {
  BookStore.saveReadingSettings({ ...store.readingSettings, ...change });
}

function isAtDefaults(): boolean {
  return areReadingSettingsEqual(store.readingSettings, DEFAULT_READING_SETTINGS);
}

export function ReadingSettingsPage() {
  return (
    <>
      <section class="reading-section">
        <ReadingPreview />
        <h2 class="reading-section-heading">{i18n('readingSettings.themeHeading')}</h2>
        <ChoiceList
          name="reading-theme"
          legend={i18n('readingSettings.themeHeading')}
          options={READING_THEMES.map((theme) => ({
            value: theme,
            label: i18n(THEME_LABEL_KEYS[theme]),
          }))}
          selected={store.readingSettings.theme}
          onSelect={(theme) => updateReadingSettings({ theme })}
        />
      </section>

      <section class="reading-section">
        <ReadingPreview />
        <h2 class="reading-section-heading">{i18n('readingSettings.fontHeading')}</h2>
        <ChoiceList
          name="reading-font"
          legend={i18n('readingSettings.fontHeading')}
          options={READING_FONTS.map((font) => ({
            value: font,
            label: i18n(FONT_LABEL_KEYS[font]),
            fontFamily: readingFontFamily(font),
          }))}
          selected={store.readingSettings.font}
          onSelect={(font) => updateReadingSettings({ font })}
        />
        <p class="field-hint">{i18n('readingSettings.fontHint')}</p>
      </section>

      <section class="reading-section">
        <ReadingPreview />
        <h2 class="reading-section-heading">{i18n('readingSettings.sizeHeading')}</h2>
        <ChoiceList
          name="reading-size"
          legend={i18n('readingSettings.sizeHeading')}
          options={READING_SIZES.map((size) => ({
            value: size,
            label: i18n(SIZE_LABEL_KEYS[size]),
          }))}
          selected={store.readingSettings.size}
          onSelect={(size) => updateReadingSettings({ size })}
        />
      </section>

      <section class="reading-section">
        <ReadingPreview />
        <h2 class="reading-section-heading">
          {i18n('readingSettings.lineSpacingHeading')}
          <span class="reading-section-value">{store.readingSettings.lineSpacing.toFixed(2)}</span>
        </h2>
        <input
          class="reading-slider"
          type="range"
          min={LINE_SPACING_MIN}
          max={LINE_SPACING_MAX}
          step={LINE_SPACING_STEP}
          value={store.readingSettings.lineSpacing}
          aria-label={i18n('readingSettings.lineSpacingHeading')}
          onInput={(event) =>
            updateReadingSettings({ lineSpacing: Number(event.currentTarget.value) })
          }
        />
      </section>

      <section class="reading-section">
        <ReadingPreview />
        <h2 class="reading-section-heading">{i18n('readingSettings.marginsHeading')}</h2>
        <ChoiceList
          name="reading-margins"
          legend={i18n('readingSettings.marginsHeading')}
          options={READING_MARGINS.map((margins) => ({
            value: margins,
            label: i18n(MARGINS_LABEL_KEYS[margins]),
          }))}
          selected={store.readingSettings.margins}
          onSelect={(margins) => updateReadingSettings({ margins })}
        />
      </section>

      <section class="reading-section">
        <ReadingPreview />
        <h2 class="reading-section-heading">{i18n('readingSettings.justifyHeading')}</h2>
        <ChoiceList
          name="reading-justify"
          legend={i18n('readingSettings.justifyHeading')}
          options={[
            { value: 'on', label: i18n('readingSettings.justifyOn') },
            { value: 'off', label: i18n('readingSettings.justifyOff') },
          ]}
          selected={store.readingSettings.justifyText ? 'on' : 'off'}
          onSelect={(value) => updateReadingSettings({ justifyText: value === 'on' })}
        />
      </section>

      <div class="settings-actions">
        <button
          class="btn-secondary"
          disabled={isAtDefaults()}
          onClick={() => BookStore.saveReadingSettings(DEFAULT_READING_SETTINGS)}
        >
          {i18n('readingSettings.resetButton')}
        </button>
      </div>
    </>
  );
}
