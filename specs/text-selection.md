# Text selection

The reader's custom text selection: long-press a word (touch) or drag across text or double-click a word (mouse), adjust it with the handles, then copy it or search the web for it.

The browser's native selection is turned off on reader paragraphs (`user-select: none`, `-webkit-touch-callout: none`) and the selection is drawn by the app instead. Native selection fights the reader's own touch gestures (tap to turn pages, swipe), and its iOS callout can't be styled or extended.

## Files

| File | Role |
|---|---|
| [`lib/selection-manager.ts`](../apps/client/src/lib/selection-manager.ts) | `SelectionManager`, the framework-free class that holds all selection logic |
| [`lib/create-selection-manager.ts`](../apps/client/src/lib/create-selection-manager.ts) | `createSelectionManager()`, the Solid adapter over it |
| [`lib/text-offsets.ts`](../apps/client/src/lib/text-offsets.ts) | Pure helpers that map between viewport points, text offsets and `Range`s |
| [`lib/copy-text.ts`](../apps/client/src/lib/copy-text.ts) | `copyText()`, clipboard write with a fallback for insecure contexts |
| [`components/SelectionOverlay.tsx`](../apps/client/src/components/SelectionOverlay.tsx) | Selection boxes and the two drag handles |
| [`components/SelectionToolbar.tsx`](../apps/client/src/components/SelectionToolbar.tsx) | Copy and Search in Web buttons |
| [`components/ReaderPage.tsx`](../apps/client/src/components/ReaderPage.tsx) | Gesture wiring and dismissal |

All paths are relative to `apps/client/src`. The class/adapter split follows [JavaScript / TypeScript](javascript-typescript.md).

## Behaviour

### Starting a selection

- A touch held for `LONG_PRESS_MS` (450 ms) on `.reader-content` starts a selection at the touch point.
- Moving more than `TAP_MOVE_TOLERANCE_PX` (10 px) on either axis before then cancels the long-press, so swipes and scrolls never select.
- The word under the point is selected, using `Intl.Segmenter` word boundaries so it works for any language the browser supports. A press on whitespace or punctuation selects nothing.
- No long-press timer starts while a selection is already open.
- The `touchend` that ends a long-press is swallowed, so releasing the finger doesn't also count as a tap that turns the page.

### Starting a selection with a mouse

Desktop has no long-press, so the mouse uses the gestures of native selection. On devices with a mouse, paragraphs show the text cursor (`cursor: text` under `(hover: hover) and (pointer: fine)`).

- **Press and drag** (`pointerdown` on `.reader-content`) selects from the press point to the pointer, character by character, in either direction. Moving back onto the press point keeps the last non-empty selection rather than clearing it. A press without movement selects nothing.
- **Double-click** selects the word under the pointer, the same as a long-press.
- Only `pointerType === 'mouse'` with the primary button starts a drag selection. Touch and pen are ignored, because on touch screens a press-and-drag is a swipe and selection starts from a long-press instead.

### Adjusting it

- Each end of the selection has a handle at the bottom of its line. Dragging a handle moves that end to the character under the pointer.
- The selection always keeps at least one character: the start can't pass `end - 1`, nor the end `start + 1`.
- The hit-test point is shifted up by half the paragraph's line height. A finger on a handle sits right on the boundary with the next line, so without the shift any natural drag would jump down a line.
- A selection is confined to the paragraph it started in. Points outside that paragraph are ignored rather than extending the selection.

### Actions

The toolbar sits centred above the selection, kept within the reading area's left and right edges.

- **Copy** writes the selected text to the clipboard, then closes the selection.
- **Search in Web** opens `https://www.google.com/search?q=<text>` in a new tab with `noopener`, then closes the selection. Leading and trailing whitespace is trimmed, and nothing opens if the trimmed text is empty.

### Dismissal

The selection closes when:

- the user taps anywhere in `.reader-content` outside the toolbar and handles (the tap only dismisses; it does not also turn the page),
- the mouse is pressed anywhere in `.reader-content` outside the toolbar and handles, which also starts a new drag selection,
- the page turns, by tap, swipe, keyboard or navigation buttons,
- the book is re-paginated, for example on resize, because the paragraph elements it points at are replaced,
- Escape is pressed (it closes the selection before it would close the reader).

While a selection is open, the page-turn keys (arrows, Page Up/Down, Space) do nothing.

## `SelectionManager`

### State

```ts
type ActiveSelection = {
  paragraphEl: HTMLElement;
  startOffset: number;
  endOffset: number;
};
```

The selection is stored as offsets into the paragraph's combined text (all its text nodes joined in document order), not as a live `Range`. A `Range` points at specific text nodes and breaks when those nodes are re-rendered; offsets can always be resolved again against `paragraphEl`.

The class also caches one `Range` per selection change, built in `#setSelection`. Every consumer (selection boxes, handles, toolbar, copy and search) reads that cached `Range` instead of walking the paragraph's text nodes again.

### API

| Member | Description |
|---|---|
| `selection` | Current `ActiveSelection`, or `null` |
| `range` | Cached `Range` for the current selection, or `null` |
| `subscribe(listener)` | Calls `listener(selection)` after every change; returns an unsubscribe function |
| `selectWordAtPoint(clientX, clientY)` | Selects the word at a viewport point (long-press, double-click) |
| `selectByPointerDrag(event)` | From a mouse `pointerdown`: dismisses the open selection, then selects as the pointer drags |
| `dragHandle(edge, event)` | Starts dragging the `'start'` or `'end'` handle from its `pointerdown` event |
| `copyActiveSelection()` | Copies the selected text, then dismisses |
| `searchActiveSelectionInWeb()` | Opens a web search for the selected text, then dismisses |
| `dismissSelection()` | Clears the selection |

Listeners are notified only when the selection actually changes. Setting the same object again, dismissing an empty selection, or a drag step that lands on the same offsets notifies no one.

### Dragging

`dragHandle` and `selectByPointerDrag` share `#trackPointer`, which must stay cheap and must survive re-renders:

- **One update per frame.** Pointer moves arrive faster than the screen repaints, and each hit-test walks the paragraph's text nodes. Moves are stored and applied once per `requestAnimationFrame`; on release, any pending move is applied immediately.
- **Listeners on `window`.** `pointermove`, `pointerup` and `pointercancel` are listened for on `window`, filtered by `pointerId`, and removed when the drag ends. The handle also takes pointer capture. If the handle element were ever re-created mid-drag, listeners on the element itself would be lost along with it.
- **Line height read once,** at the start of a handle drag, not on every move.
- **Mouse drags hit-test at the pointer itself.** Handle drags shift the hit-test point up half a line; mouse drags don't, because the cursor sits on the text it's pointing at.

## Solid adapter

`createSelectionManager()` creates one `SelectionManager` per reader mount and exposes:

- `activeSelection()` and `activeRange()` signals, both updated in a single `batch` on every change,
- the class's methods, bound, so they can be passed directly as event props,
- an `onCleanup` that unsubscribes.

It contains no selection logic.

## Rendering

- **Selection boxes** are positioned `<div>`s (`.selection-rect`), one per rect from `range.getClientRects()`, with `pointer-events: none`. The CSS Custom Highlight API isn't used because WebKit doesn't reliably paint `::highlight()` on iOS.
- **The overlay must not be re-created during a drag.** `<Show when={activeRange()}>` in `ReaderPage.tsx` must stay **non-keyed**. The `Range` is a new object on every drag step, and a keyed `Show` would destroy and rebuild the overlay each time, including the handle that holds pointer capture. That stalled drags in an earlier version.
- **Selection boxes use `<Index>`, not `<For>`.** Each drag step produces new `DOMRect` objects, so `<For>` would recreate every box instead of moving the existing ones.
- **The toolbar is portalled to `<body>`** with `position: fixed` and `z-index: 250`, which is above the reader and its header (200) and below sheets and modals (300+). `.reader-content` has `overflow: hidden`, which would clip the toolbar when the selection is on the first line and the toolbar needs to reach up over the header.
- **Handles and the toolbar stop propagation.** Without that, touches on them would reach `.reader-content`'s tap and long-press handling, and a mouse `pointerdown` would dismiss the selection before the toolbar's click lands. Handles stop it inside `dragHandle`; the toolbar stops `pointerdown`, `touchstart`, `touchend` and `click`. In Solid, events from a portal still bubble to where the component is mounted, so the portalled toolbar needs this too.

## Clipboard

`copyText(text)` uses `navigator.clipboard.writeText` when it exists. The Clipboard API is only available in secure contexts (HTTPS or `localhost`), and the app is usually served over plain HTTP on the NAS (see [`docs/truenas.md`](../docs/truenas.md)). There, it falls back to `document.execCommand('copy')` on a temporary off-screen `<textarea>`:

- `readOnly`, so iOS doesn't open the keyboard,
- `font-size: 16px`, so iOS doesn't zoom in,
- an explicit `setSelectionRange`, because iOS ignores `select()` on a read-only field,
- removed straight after copying.

It returns whether the copy succeeded. `copyActiveSelection` logs an error when it fails.

## Not supported

- Selections that span more than one paragraph, or both pages of the two-page spread.
- Saving highlights. An earlier version stored highlights in IndexedDB; it was removed, and the database stays at version 1.

## Tests

- [`selection-manager.test.ts`](../apps/client/src/lib/selection-manager.test.ts): word selection, ignoring whitespace, notification rules, unsubscribe, and mouse drag selection (both directions, one update per frame, plain click, dismissal on press, touch ignored).
- [`text-offsets.test.ts`](../apps/client/src/lib/text-offsets.test.ts): offset ↔ `Range`, point → offset, word bounds.
- [`copy-text.test.ts`](../apps/client/src/lib/copy-text.test.ts): Clipboard API path, `execCommand` fallback, refusal.

jsdom has no layout or `PointerEvent`, so tests stub `document.elementFromPoint` and `document.caretRangeFromPoint`, and build pointer events from `MouseEvent`. Touch dragging, rendering and the clipboard fallback are checked by hand on iOS Safari; mouse selection can also be driven with Playwright against the dev server.
