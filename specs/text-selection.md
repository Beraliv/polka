# Text selection

The reader's custom text selection: start a selection with a long-press (touch) or by dragging or double-clicking (mouse), adjust it with two handles across any paragraphs on screen, then copy it, search the web for it, or have Claude explain it.

## Why a custom selection

Native text selection is turned off on reader paragraphs (`user-select: none`, `-webkit-touch-callout: none`) and the app draws its own:

- **Native selection fights the reader's gestures.** Taps at the page edges turn pages; a native long-press and drag would compete with them.
- **The iOS callout can't be styled or extended,** so actions like Search in Web couldn't be added to it.

## Where it lives

| File (under `apps/client/src`) | Role |
|---|---|
| [`lib/selection-manager.ts`](../apps/client/src/lib/selection-manager.ts) | `SelectionManager`: all selection logic, framework-free |
| [`lib/create-selection-manager.ts`](../apps/client/src/lib/create-selection-manager.ts) | Solid adapter over it |
| [`lib/text-offsets.ts`](../apps/client/src/lib/text-offsets.ts) | Positions in the text: hit-testing, ordering, `Range`s, selected text and its boxes |
| [`lib/copy-text.ts`](../apps/client/src/lib/copy-text.ts) | Clipboard write, with a fallback for plain HTTP |
| [`components/SelectionOverlay.tsx`](../apps/client/src/components/SelectionOverlay.tsx) | Selection boxes and handles |
| [`components/SelectionToolbar.tsx`](../apps/client/src/components/SelectionToolbar.tsx) | Copy, Search in Web and Explain buttons |
| [`components/ReaderPage.tsx`](../apps/client/src/components/ReaderPage.tsx) | Gesture wiring and dismissal |

The split between the class and its adapter follows [JavaScript / TypeScript](javascript-typescript.md).

## Behaviour

### Starting a selection with touch

- Holding a finger still on a word for `LONG_PRESS_MS` selects that word. Moving further than `TAP_MOVE_TOLERANCE_PX` first cancels it, so swipes and scrolls never select.
- Word boundaries come from `Intl.Segmenter`, so selection works in any language the browser can segment. A long-press on whitespace or punctuation selects nothing.
- Lifting the finger after a long-press doesn't count as a tap, so it never turns the page.
- No new long-press starts while a selection is open; a tap dismisses it first.

### Starting a selection with a mouse

A mouse has no long-press, so it uses the gestures people know from native selection. On devices with a mouse, paragraphs show the text cursor.

- **Press and drag** selects from the press point to the pointer, character by character, in either direction and across paragraphs. A press without movement selects nothing.
- **Double-click** selects the word under the pointer.
- Only a mouse starts these. Touch screens can report the same events (a drag is a swipe there, and mobile browsers can turn a double-tap into a `dblclick`), and touch already has its own gesture.

### Adjusting a selection

- Each end has a handle at the bottom of its line. Dragging a handle moves that end to the character under the pointer, with a mouse or a finger.
- A selection always keeps at least one character; one end can't be dragged onto or past the other.
- A handle sits at the bottom of its line, so a finger on it is right at the boundary with the next line. The point is read half a line higher, so a sideways drag stays on the handle's own line instead of jumping down.
- Either end can move into other paragraphs, anywhere on the visible page, or both pages of a two-page spread. Over a gap with no text (margins, the space between paragraphs), that end stays where it last was.

### Actions

The toolbar sits centred above the selection, kept within the reading area horizontally. It may extend up over the reader header when the selection is on the first line.

- **Copy** puts the selected text on the clipboard and closes the selection. Paragraphs are separated by a line break. The exception is a paragraph that pagination split across a page break: its two parts are joined with a space, as the one paragraph they are in the book.
- **Search in Web** opens a Google search for the selected text in a new tab and closes the selection. Leading and trailing whitespace is trimmed, and nothing opens if no text is left.

- **Explain** hands the selected text, trimmed, to the explanation sheet and closes the selection. See [Explanation](explanation.md).

The search engine is a fixed default with no setting yet. Searching sends the selected text to Google, and Explain sends it to the Polka server and on to Claude; nothing is sent until the user presses a button.

### Dismissal

A selection lives only as long as the page it was made on. It closes when:

- **the visible page changes** in any way: turning the page, the arrow keys, the TOC, or the book being re-paginated (for example on resize or rotation);
- **the user taps or clicks elsewhere** in the reading area. A tap only dismisses and doesn't also turn the page; a mouse press also starts a new drag selection. The prev/next arrow buttons are the exception: they dismiss and turn the page;
- **Escape** is pressed, after any open image, footnote or TOC, but before it would leave the reader;
- **an action runs** (Copy, Search in Web, Explain).

While a selection is open, the page-turn keys do nothing, so a stray key press can't close it by turning the page.

## Design

### Selection state: two text positions

A selection is a start and an end position, in reading order. A position is a rendered paragraph element plus an offset into that paragraph's text (all its text nodes joined in order); the two can be in different paragraphs. From them, the manager builds one `Range` per change, which the boxes, handles and toolbar use.

- **Why paragraph and offset, not a DOM node:** a paragraph's text is split across several text nodes by styling (bold, italic, footnote markers). An offset into the whole paragraph is unaffected by that, and an unchanged drag step can be detected by comparing an element and a number, then skipped without re-rendering anything.
- **Order comes from the document.** Positions in one paragraph compare by offset; positions in different paragraphs compare by the paragraphs' order in the page, which is reading order, including across the two pages of a spread.
- **Why it can't outlive the page:** paragraph elements are rendered by the current page. When the page changes or the book is re-paginated, they are replaced and the selection would point at nothing. So the reader dismisses on any change to the page index or page list, rather than in each way of navigating, which once missed the TOC.

### Text and boxes are built from the paragraphs, not the `Range`

A `Range` across elements serves neither copying nor painting as-is:

- **`Range.toString()` joins paragraphs with nothing between them.** The copied text is built paragraph by paragraph instead, adding a line break between paragraphs, or a space before a page-split continuation (pagination splits paragraphs on whitespace and drops it at the split).
- **`Range.getClientRects()` also returns the box of every element fully inside the range.** Across paragraphs, that's whole paragraph blocks, margins and indents included, and inline elements such as bold text add a second box on top of their own text. Boxes are measured per text node instead, so only the text itself is painted, once.

### Framework-free manager, observed by subscription

`SelectionManager` holds the selection and exposes it through getters plus `subscribe(listener)`, which returns an unsubscribe function. Listeners are called only when the selection actually changes; a drag that stays on the same character, or dismissing an empty selection, notifies no one.

The Solid adapter creates one manager per reader mount, copies the selection and `Range` into signals on each change, unsubscribes on unmount, and exposes the methods bound so they can be passed straight to event props. It holds no selection logic.

### Dragging stays cheap and survives re-renders

Handle drags and mouse drags share the same pointer tracking:

- **At most one update per frame.** Pointer moves arrive faster than the screen repaints, and each hit-test walks a paragraph's text nodes, so only the latest position per animation frame is used. On release, a pending position is applied straight away; when the browser cancels the gesture, it's dropped.
- **Listening on `window`, filtered by pointer id.** A drag keeps working even if the element that was pressed is replaced mid-gesture, and a drag can continue across other paragraphs and gaps.

### Copying over plain HTTP

The async Clipboard API exists only on secure pages (HTTPS or `localhost`), and Polka is usually served over plain HTTP on the NAS (see [`docs/truenas.md`](../docs/truenas.md)). There, copying falls back to `document.execCommand('copy')` on a temporary off-screen text field.

Browsers allow `execCommand('copy')` only while handling the user's tap or click. The fallback therefore has to run synchronously from the button's handler: **nothing may be awaited before it**. Copy reports whether it succeeded, and a failure is logged.

## Invariants

Each of these fixed a real bug; keep them unless the reason no longer applies.

- **The selection UI must not re-mount while it's open.** The `<Show>` around the overlay and toolbar stays non-keyed, and the selection boxes use `<Index>` rather than `<For>`. The `Range` and its rects are new objects on every drag step. A keyed `<Show>` would rebuild the overlay each time, destroying the handle mid-drag and stalling it. `<For>` would recreate every box instead of moving it.
- **The toolbar renders outside the reading area.** It's portalled to `<body>` with fixed positioning. The reading area clips its overflow, which would cut the toolbar off on the first line. It's layered above the reader and its header and below sheets and modals.
- **Presses on the handles and toolbar don't reach the reading area.** Both stop touch and pointer events from propagating. Otherwise a touch on them would count as a tap or start a long-press, and a mouse press would dismiss the selection before the toolbar's click landed. Solid bubbles events from a portal to where it's mounted, so the portalled toolbar needs this too.
- **Selection boxes don't catch input** (`pointer-events: none`), so taps go to the text underneath.
- **Boxes are drawn as positioned elements,** not with the CSS Custom Highlight API, which WebKit doesn't reliably paint on iOS.
- **Boxes are measured from text nodes only,** never with `getClientRects()` on the whole `Range`, which would paint entire paragraphs as blocks (see above).

## Not supported

- Extending a selection beyond the visible page(s). Turning the page closes it.
- Copying with Cmd/Ctrl+C; only the toolbar copies.
- Selecting with the keyboard or a screen reader.
- Choosing a different search engine.
- Saving selections as highlights. An earlier version stored them in IndexedDB; it was removed because nothing used them yet.

## Testing

jsdom has no layout and no `PointerEvent`. Unit tests stub hit-testing (`document.caretRangeFromPoint`) and build pointer events from `MouseEvent`, which covers the manager's logic but not real gestures. Touch gestures, rendering and the clipboard fallback need checking on a real device (iOS Safari); mouse selection can be driven with Playwright against the dev server.
