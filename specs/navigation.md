# Navigation

How the reader turns pages: swipe, tap or click on a page margin, the prev/next arrow buttons, and the keyboard.

## Where it lives

| File (under `apps/client/src`) | Role |
|---|---|
| [`lib/page-navigation.ts`](../apps/client/src/lib/page-navigation.ts) | `PageNavigation`: classifies a press as a swipe, a margin tap or neither, and calls the page turn. Framework-free |
| [`lib/create-page-navigation.ts`](../apps/client/src/lib/create-page-navigation.ts) | Solid adapter over it: converts DOM pointer events and listens for releases on `window` |
| [`components/PageNavigationButtons.tsx`](../apps/client/src/components/PageNavigationButtons.tsx) | The prev/next arrow buttons shown on hover |
| [`components/ReaderPage.tsx`](../apps/client/src/components/ReaderPage.tsx) | Supplies the page turns, the overlay check and the selection dismissal; keeps the keyboard and the long-press timer |

The split between the class and its adapter follows [JavaScript / TypeScript](javascript-typescript.md).

## Behaviour

### Swipe

| Gesture | Result |
|---|---|
| Finger moves left | Next page |
| Finger moves right | Previous page |

This is the convention of Apple Books and Kindle: the page is dragged away in the direction of the finger.

A touch counts as a swipe when it ends with:

- horizontal travel of at least `SWIPE_MIN_DISTANCE_PX` (50), and
- horizontal travel at least `SWIPE_DIRECTION_RATIO` (2) times the vertical travel, so a diagonal or vertical scroll never turns the page.

There is no time limit: a slow drag is still a swipe. A swipe can start anywhere on the reading area, margins included. It turns the page once, on release; the page does not follow the finger.

### Margin tap and click

| Gesture | Result |
|---|---|
| Tap or click in the left margin | Previous page |
| Tap or click in the right margin | Next page |

- A margin is a strip of `MARGIN_ZONE_REM` (2rem, following the font size) at the left and right edge of the reading area. In two-page view the margins are the outer edges of the spread, not the edges of each page.
- A press counts as a tap or click when the pointer moves no further than `TAP_MOVE_TOLERANCE_PX` (10) between press and release. A press that moves further is a swipe or a drag, never a tap.
- Taps and clicks in the text area do nothing. They keep their own meaning: footnote markers, images, and dismissing a selection.
- The release must land inside the reading area. A press that ends over the header or outside the reader turns nothing.
- Touch and mouse follow the same rule. Each click turns the page once, so a double-click in a margin turns it twice.
- The hover arrow buttons stay as a visible affordance for the mouse and sit inside the margin. Their press does not start a margin press, so the page turns exactly once, from the button's click.

### Keyboard

Unchanged: `ArrowRight`, `PageDown` and `Space` go to the next page; `ArrowLeft` and `PageUp` to the previous one. They stay in `ReaderPage.tsx` and call the same page turns the gestures use.

### Page step and edges

- A turn moves by one page, or by two in two-page view (spreads keep starting on an even index).
- At the first page, previous does nothing; at the last page (or last spread), next does nothing. There is no wrap-around, no bounce animation, and the arrow button is disabled at that edge as today.
- Every turn scrolls the reading area back to the top.

### When navigation is blocked

Gestures and keys do nothing while an overlay sits over the page: an open footnote, a fullscreen image, the TOC, or the explanation sheet.

An open text selection is treated differently by input:

- **Keys** do nothing, so a stray key can't close the selection.
- **A swipe or margin tap** only closes the selection and does not also turn the page. The next gesture turns it.
- **A drag** (mouse selection) never turns the page and leaves the selection alone.

A long-press that starts a selection never turns the page on release, since its release is not a tap. The long-press timer in `ReaderPage.tsx` abandons the press as it fires.

## Design

### Press in progress, decided on release

`PageNavigation` holds no state worth observing, so it has no `subscribe`. It holds only the press in progress (pointer id, pointer type, start point) and exposes:

```ts
class PageNavigation {
  constructor(options: {
    onPreviousPage: () => void;
    onNextPage: () => void;
    isBlocked: () => boolean;        // an overlay covers the page
    dismissSelection: () => boolean; // closes a selection; returns true if one was open
  });

  pressStart(press: { pointerId: number; pointerType: string; x: number; y: number }): void;
  pressEnd(release: { pointerId: number; x: number; y: number; areaRect: ViewportRect; marginWidthPx: number }): void;
  pressCancel(pointerId: number): void;
  abandonPress(): void;
}
```

`pressEnd` decides in this order:

1. Not the pointer that started the press → nothing.
2. An overlay is open, or the release is outside the reading area → nothing.
3. Neither a tap nor a swipe (a mouse drag, or a short or diagonal move) → nothing.
4. A selection is open → it is closed, and nothing else happens.
5. A tap turns by margin side; a swipe turns by direction.

The geometry (`swipeTurn`, `marginTurn`) is exported as pure functions and tested without events.

Each function takes at most two parameters, or one options object (see [JavaScript / TypeScript](javascript-typescript.md)).

### One pointer pipeline

Presses start on the reading area (`onPointerDown`). Releases and cancels are listened to on `window`, so a finger that lifts outside the reading area still ends its press. Otherwise the next tap would look like a second finger.

- The reading area sets `touch-action: pan-y`, so the browser keeps vertical scrolling but leaves horizontal drags to us. Without it the browser claims horizontal pans and fires `pointercancel`, and the swipe is lost.
- A `pointercancel` (the browser started a scroll) ends the press with no turn.
- A second finger on the page cancels the press. A pinch never turns the page, and neither finger's release does.
- `abandonPress()` is for the long-press timer, which takes the gesture for a selection.

### Mouse drag vs. click

A mouse press-and-drag starts a text selection. A mouse never swipes, and a drag is neither a tap nor a swipe for navigation, so dragging to select can never turn the page.

### Arrow buttons

The arrow buttons stop their own `pointerdown` from reaching the reading area. Without that a press on the button would also count as a margin tap, and the page would turn twice.

## Invariants

- **No framework imports in `page-navigation.ts`.** Its tests run without Solid or a DOM.
- **A gesture turns the page at most once.** The arrow buttons stop their own press from reaching the reading area.
- **Direction is defined in one place** (`TURN_FOR_SWIPE_DIRECTION` in `page-navigation.ts`), so changing the convention touches one line.
- **Thresholds are named constants**, exported for tests: `SWIPE_MIN_DISTANCE_PX`, `SWIPE_DIRECTION_RATIO`, `MARGIN_ZONE_REM`, `TAP_MOVE_TOLERANCE_PX`.

## Not supported

- Page-turn animation or a page that follows the finger.
- Swipe with a mouse or trackpad drag.
- Tap zones that can be resized, swapped, or turned off in settings.
- Vertical swipes (they scroll).
- Wrapping from the last page to the first.

## Testing

Unit tests in [`lib/page-navigation.test.ts`](../apps/client/src/lib/page-navigation.test.ts) cover the geometry and `PageNavigation`: swipe direction and thresholds, diagonal rejection, margin hit-testing on each side, tap vs. move tolerance, mouse drags, blocked state, selection dismissal, outside-area releases, cancels, second pointers and abandoned presses.

Real gestures were checked in headless Chromium with Playwright, sending touch through the DevTools protocol as the screenshot script does: swipes both ways, a vertical swipe, margin taps, mouse clicks in the margins, the arrow buttons (one turn each), the arrow keys, a mouse drag, a long-press, and a margin tap while a selection is open. iOS Safari still needs a check on a device, mainly that a vertical scroll is not cancelled by a horizontal swipe.
