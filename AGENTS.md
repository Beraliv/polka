# Code guidelines

Detailed specs live in [`specs/`](specs/) and are part of these guidelines. Read a spec only when the change touches the files it covers:

- [JavaScript / TypeScript](specs/javascript-typescript.md), when changing `*.js`, `*.jsx`, `*.ts` or `*.tsx` files
- [Text selection](specs/text-selection.md), when changing the reader's text selection: `selection-manager.ts`, `create-selection-manager.ts`, `text-offsets.ts`, `copy-text.ts`, `SelectionOverlay.tsx`, `SelectionToolbar.tsx`, or the selection wiring in `ReaderPage.tsx`
- [Explanation](specs/explanation.md), when changing the Explain action: `explain.ts` (server), `explanation-manager.ts`, `create-explanation-manager.ts`, `ExplanationSheet.tsx`, `ExplanationSettings.tsx`, `EXPLANATION_LANGUAGES` in `packages/shared`, or the explanation wiring in `ReaderPage.tsx`

## Philosophy

- **Descriptive names > brevity** — a name that explains what something is or does is always better than a short one. Avoid abbreviations and single-letter variables outside of trivial loop counters.
- **Correctness > cleverness** — prefer straightforward, readable code over compact or "clever" solutions. If a reader has to pause to understand it, rewrite it.
- **Comments**: comments are added to explain why the logic has been added, why the code works one way and not another, why the code works when it looks like it won't, etc; comments that explain the "what" are redundant and require removal.

## Functions

- **Maximum 2 parameters.** If a function needs more than 2 inputs, group them into a named options object instead.

  ```ts
  // bad
  function buildPages(contentEl, sections, availableHeight, availableWidth) { ... }

  // good
  function buildPages({ contentEl, sections, availableHeight, availableWidth }: BuildPagesOptions) { ... }
  ```

- This rule applies to all function types: plain functions, arrow functions, methods, and callbacks.
- Exception: a well-known positional pair (e.g. `(error, result)` in a Node callback) is acceptable where it matches an established convention, but prefer the options-object style when in doubt.

## UI

- **Icons must be SVG, not ASCII/Unicode symbols or emojis.** When adding icon-like UI elements (close/X button, add/+ button, arrows, chevrons, file/folder markers, decorative illustrations, etc.), use an inline SVG icon instead of text characters like `×`, `+`, `✕`, `→`, or `⚙`, or emojis like `📁`, `📖`, or `📚`. Text glyphs and emojis render inconsistently across platforms and fonts; SVGs are crisp, stylable, and alignable.

## Documentation

- **Every big slice of functionality must be documented in `README.md` under the "Features" section**, in the same commit that introduces it. Small fixes and internal refactors don't need a README entry.
- **Small features must be documented in `docs/features.md`**, in the same commit that introduces them.
- **README's Features section must not repeat `docs/features.md`.** A feature belongs in exactly one place: format-level parser/reader capabilities (anything with an FB2/EPUB dimension) go in the `docs/features.md` matrix only; README keeps app-level features and the link to the matrix.
- **UI screenshots must stay current.** Any change to user-visible UI (copy, icons, layout, new screens) must regenerate the README screenshots by following [docs/screenshots.md](docs/screenshots.md).

## Versioning

- **Every commit that changes `apps/client` or `apps/server` must bump the `version` field in that app's `package.json`** (patch for fixes, minor for features), in the same commit. A change to `packages/shared` counts as a change to both apps.

## Git

- **When a commit addresses a GitHub issue, link it with `Closes #<issue-number>`** on its own line in the commit message body.
- **Follow the "Before committing" workflow in `CONTRIBUTING.md`** before considering any change done.
