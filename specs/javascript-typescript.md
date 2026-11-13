# JavaScript / TypeScript

How business logic is structured and written in this repository. These rules apply to every package (`apps/client`, `apps/server`, `packages/shared`).

## 1. Keep business logic in ES6 classes

Business logic (state, the rules for changing it, and the actions run on it) lives in plain ES6 classes that don't import any frontend framework: no `solid-js`, `react`, `vue`, etc.

**Why:** framework code is tied to a rendering lifecycle and is hard to test, reuse or move. A plain class runs anywhere: in a unit test without a DOM framework, on the server, or under a different UI framework. Framework migrations then only touch the thin layer that renders it.

```ts
// bad — the logic only exists inside Solid's reactive system
export function createSelectionManager() {
  const [activeSelection, setActiveSelection] = createSignal<ActiveSelection | null>(null);
  function dismissSelection() {
    setActiveSelection(null);
  }
  // ...
}

// good — framework-free; anyone can observe it through `subscribe`
export class SelectionManager {
  #currentSelection: ActiveSelection | null = null;
  readonly #listeners = new Set<SelectionListener>();

  get selection(): ActiveSelection | null {
    return this.#currentSelection;
  }

  subscribe(listener: SelectionListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dismissSelection(): void {
    this.#setSelection(null);
  }
  // ...
}
```

A class that UI needs to react to exposes its state through getters and a `subscribe(listener)` method that returns an unsubscribe function, and notifies listeners only when the state actually changed.

## 2. Use framework adapters over the classes

When a component needs business logic, write a thin adapter (a Solid primitive, a React hook, a Vue composable) that wraps the class. The adapter only:

- creates (or receives) the class instance,
- mirrors the class's state into the framework's reactive primitives via `subscribe`,
- unsubscribes when the owning component unmounts,
- exposes the class's methods, bound, so they can be passed straight to event props.

It contains no business logic of its own.

Reference implementation: [`apps/client/src/lib/create-selection-manager.ts`](../apps/client/src/lib/create-selection-manager.ts), the Solid adapter over [`SelectionManager`](../apps/client/src/lib/selection-manager.ts):

```ts
export function createSelectionManager() {
  const manager = new SelectionManager();
  const [activeSelection, setActiveSelection] = createSignal(manager.selection);

  const unsubscribe = manager.subscribe(setActiveSelection);
  onCleanup(unsubscribe);

  return {
    activeSelection,
    dismissSelection: () => manager.dismissSelection(),
    // ...
  };
}
```

The same class would get a React adapter with `useSyncExternalStore(manager.subscribe, () => manager.selection)`.

## 3. Use `#private` members, not the `private` keyword

Mark class internals with JavaScript's `#` syntax (`#field`, `#method()`), not TypeScript's `private` modifier.

**Why:** `private` is only checked at compile time. At runtime the member is an ordinary property, visible through `Object.keys`, `JSON.stringify` and `console.log`, and reachable with an `as any` cast. `#private` members are enforced by the JavaScript engine, so the class's internals really are internal.

```ts
// bad
class SelectionManager {
  private currentSelection: ActiveSelection | null = null;
  private setSelection(next: ActiveSelection | null): void { ... }
}

// good
class SelectionManager {
  #currentSelection: ActiveSelection | null = null;
  #setSelection(next: ActiveSelection | null): void { ... }
}
```

`#private` members are ES2022 and supported natively by every current browser (Safari 15+, Chrome 84+, Firefox 90+).

A `#private` member is only accessible on a genuine instance of the class. Don't wrap such classes in a `Proxy` (some reactive stores do this), because member access through the proxy throws.

**Enforced by lint:** the `polka/no-private-keyword` rule ([`scripts/oxlint-plugins/polka.js`](../scripts/oxlint-plugins/polka.js), enabled in [`.oxlintrc.json`](../.oxlintrc.json)) reports any `private` modifier on a class member or constructor parameter.
