# Reading settings

The Reading page in Settings: theme, font, size, line spacing, margins and justification for the reader, each with a live preview that uses the reader's own styles. Tracks [issue #13](https://github.com/Beraliv/polka/issues/13).

## Where it lives

| File | Role |
|---|---|
| `apps/client/src/lib/reading-settings.ts` | The option catalogues, defaults, and the mapping from settings to CSS custom properties. Framework-free, so it can be unit-tested |
| `apps/client/src/store/books.ts` | `readingSettings` key: loaded with `load<T>()`, saved to `localStorage` under `polka:reading-settings` |
| `apps/client/src/settings/tree.ts` | New `reading` page (`labelKey: 'settings.readingLabel'`), beside `nas`, `explanation` and `developer` |
| `apps/client/src/components/settings/ReadingSettings.tsx` | The page: six sections, each with a preview above its control |
| `apps/client/src/components/ReaderPage.tsx` | Applies the same style properties to `.reader-content`; pagination already measures the result |
| `apps/client/src/styles.css` | `.reader-content`, `.reader-paragraph` and the `@media` blocks read the custom properties instead of literal values |
| `apps/client/public/fonts/` (new) | Bundled Montserrat and Source Serif 4 files, referenced by `@font-face` |

The split between pure mapping and the component follows [JavaScript / TypeScript](javascript-typescript.md).

## Behaviour

- **Settings → Reading** lists the six sections. Each section shows a preview (a sample chapter title and a few paragraphs) above its control.
- **Every preview reflects the full combination of settings**, not only the option being edited. Changing the font also changes the preview's size, spacing and margins.
- **The reader and the previews use one code path**: both apply the output of the same mapping function as inline custom properties on a `.reader-content` element. A preview cannot drift from the reader.
- **Changes apply on the next reader open.** Settings is its own route (`/settings/*`), so the reader is unmounted while the page is open and nothing on screen would reflow live. On mount the reader paginates with the saved settings, and the reading position is restored from the saved progress: `progressFraction()` turns the saved `currentPage` / `totalPages` into a fraction of the book, and that fraction is mapped onto the new page count. The saved page number is layout-specific, but only its fraction is used, so a changed layout restores approximately, not to the exact line. The first paginated save then overwrites `currentPage` / `totalPages` with the new layout's values.
- **Restore is approximate after a layout change.** Fraction-based restore drifts when pages are unevenly filled (image pages, chapter starts). An exact restore would store a text anchor (section and character offset, as in `text-offsets.ts`) instead of a page fraction; that is out of scope for this feature and would change the `Progress` shape in `packages/shared`.
- **Defaults reproduce the current reader exactly**: Georgia, size M, line spacing 1.85, Normal margins, justified text on, and the current dark colours. Shipping this changes nothing for existing readers.
- Settings are per device (`localStorage`), like the server URL and explanation language. Nothing is sent to the server.
- **Reset to defaults** is a single button at the bottom of the Reading page. It restores all six settings at once, with no confirmation, since it only changes preferences and nothing is lost. Every preview updates immediately, and the reset is saved like any other change.
- The button is disabled when every setting already equals its default, so it doesn't look actionable when it would do nothing.
- Reset doesn't touch reading progress, bookmarks or any book data.

## Options

### Theme

Applies to the reader page only. The app's own chrome keeps its current dark palette (`--bg`, `--text`), since changing it app-wide is a separate decision.

| Option | Background | Text | Notes |
|---|---|---|---|
| White | `#ffffff` | `#1a1a1a` | |
| Light | `#f4f1ea` | `#2b2b2b` | warm paper |
| Dark | `#0f172a` | `#f1f5f9` | **default**; equals `--bg` / `--text` today |
| Black | `#000000` | `#e5e5e5` | true black for OLED |

Muted text (`--text-muted`, page numbers, section hints), and the surfaces and borders of the reader's sheets and popups, each have their own colour per theme, so they stay legible on every background. Mixing them from the text colour would change the dark theme's exact values.

### Font

| Label | Stack | Source |
|---|---|---|
| Georgia | `Georgia, 'Times New Roman', serif` | system; **default** |
| Times New Roman | `'Times New Roman', Times, serif` | system |
| San Francisco | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | system; resolves per platform |
| New York | `ui-serif, Georgia, serif` | `ui-serif` resolves to New York on Apple platforms, Georgia elsewhere |
| Publico | `'Source Serif 4', Georgia, serif` | Source Serif 4 **bundled** (see below) |
| Montserrat | `Montserrat, sans-serif` | bundled (see below) |

Bundled fonts are self-hosted under `apps/client/public/fonts/` and loaded with `@font-face` (`font-display: swap`). They are **not** fetched from a CDN: Polka runs offline (PWA shell, Docker, TrueNAS), and an external font request would break it.

Source Serif 4 is bundled because a stack that names an uninstalled font silently renders as Georgia, which would make the Publico option look identical to the default. For the same reason, San Francisco and New York are described as platform-dependent in the UI hint, not promised to differ everywhere.

### Size

Five steps. The mobile and desktop values match the current `.reader-content` rules.

| Step | Mobile | Desktop (≥ 900px wide and ≥ 500px tall) |
|---|---|---|
| XS | `0.85rem` | `0.85rem` |
| S | `0.95rem` | `0.95rem` |
| M | `1.05rem` | `1.1rem` (**default**) |
| L | `1.2rem` | `1.2rem` |
| XL | `1.4rem` | `1.4rem` |

The step, not the raw value, is what gets stored, so a future change to a step's size does not move existing readers' choice.

### Line spacing

A slider from `0.8` to `2.5`, step `0.05`, default `1.85`. The step is `0.05` rather than `0.1` because stepping from `0.8` in `0.1` never reaches the default `1.85`. Stored as a number. The preview updates while dragging.

### Margins

| Option | Mobile padding | Desktop padding (≥ 900px) |
|---|---|---|
| Small | `0.5rem 1rem` | `16px 32px` |
| Normal | `0.75rem 2rem` (**default**) | `32px 64px` |
| Large | `1rem 3rem` | `48px 96px` |

The two breakpoints keep the existing `@media (min-width: 900px) and (min-height: 500px)` guard, so landscape phones stay on the mobile values.

### Justify text

On/off. Default **on**: `.reader-paragraph` is justified today, so the default preserves current output.

## Design

### One mapping, custom properties

`reading-settings.ts` turns a `ReadingSettings` value into a set of CSS custom properties (`--reader-theme-background`, `--reader-font-family`, `--reader-font-size-mobile`, `--reader-font-size-desktop`, `--reader-line-height`, `--reader-padding-mobile`, `--reader-padding-desktop`, `--reader-text-align`, and so on). The reader and the preview apply them with `style` on their root element. CSS keeps the layout rules; only the values vary. This means no pagination-specific code: `buildPages()` already reads computed styles from `.reader-page`.

Mobile and desktop values are separate properties because the breakpoint is in CSS, and a media query cannot read a value from JavaScript.

### Stored shape

```ts
interface ReadingSettings {
  theme: 'white' | 'light' | 'dark' | 'black';
  font: 'georgia' | 'times' | 'sanFrancisco' | 'newYork' | 'publico' | 'montserrat';
  size: 'xs' | 's' | 'm' | 'l' | 'xl';
  lineSpacing: number;
  margins: 'small' | 'normal' | 'large';
  justifyText: boolean;
}
```

Stored as ids, not CSS strings, so labels and stacks can change without migrating data. On load, any missing or unknown field falls back to its default, so a partial or corrupted value cannot break the reader. A `lineSpacing` outside `0.8`–`2.5` is clamped.

### Previews

The preview is a real `.reader-content` containing a `.reader-paragraph` sample, so it inherits the same rules as the reader. It is not paginated and does not need to fill the page; it is a fixed-height box that clips.

## Invariants

- **The settings page never writes to the reader's DOM.** The reader reads settings when it mounts. A preview writing into the reader's styles would leak a half-chosen setting into the book.
- **Defaults equal today's values.** Any change to a default is a visible change to every reader and needs its own decision.
- **No CDN requests.** Every font and asset ships in the client bundle.

## Not supported

- Per-book settings. Settings apply to every book.
- Changing the app's own interface theme. Only the reader.
- Syncing settings to the server. The `packages/shared` types are not touched.
- Custom fonts or custom colours.

## Testing

- `reading-settings.ts` is unit-tested: every option maps to the documented values, defaults equal the current reader's values, and unknown or out-of-range stored values fall back or clamp.
- Reset writes the default value of every field in one store update, and the button's disabled state follows whether the current settings equal the defaults.
- The store's load path is tested with a missing key, a partial object, and a corrupt value (`books.test.ts` pattern).
- The live preview, the theme contrast, and the margins at the breakpoint need a browser check: open the reader at 390px and 1280px wide, step through each option, and confirm the pagination count changes and the text does not clip at the page's bottom edge.
