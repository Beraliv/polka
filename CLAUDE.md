# Code guidelines

## Philosophy

- **Descriptive names > brevity** — a name that explains what something is or does is always better than a short one. Avoid abbreviations and single-letter variables outside of trivial loop counters.
- **Correctness > cleverness** — prefer straightforward, readable code over compact or "clever" solutions. If a reader has to pause to understand it, rewrite it.

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

## Documentation

- **Every big slice of functionality must be documented in `README.md` under the "Features" section**, in the same commit that introduces it. Small fixes and internal refactors don't need a README entry.

## Versioning

- **Every commit that changes `apps/client` or `apps/server` must bump the `version` field in that app's `package.json`** (patch for fixes, minor for features), in the same commit. A change to `packages/shared` counts as a change to both apps.
