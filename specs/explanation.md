# Explanation

The reader's Explain action: Claude explains a passage the reader selected, in a sheet at the bottom of the page, in the language chosen in Settings.

## Where it lives

| File | Role |
|---|---|
| [`packages/shared/src/index.ts`](../packages/shared/src/index.ts) | `EXPLANATION_LANGUAGES`, `ExplainRequest` |
| [`apps/server/src/routes/explain.ts`](../apps/server/src/routes/explain.ts) | `POST /api/explain`: the prompt and the call to Claude |
| [`apps/client/src/lib/explanation-manager.ts`](../apps/client/src/lib/explanation-manager.ts) | `ExplanationManager`: requesting, streaming and closing, framework-free |
| [`apps/client/src/lib/create-explanation-manager.ts`](../apps/client/src/lib/create-explanation-manager.ts) | Solid adapter over it |
| [`apps/client/src/components/ExplanationSheet.tsx`](../apps/client/src/components/ExplanationSheet.tsx) | The bottom sheet and its swipe down |
| [`apps/client/src/components/settings/ExplanationSettings.tsx`](../apps/client/src/components/settings/ExplanationSettings.tsx) | The language setting |
| [`apps/client/src/components/ReaderPage.tsx`](../apps/client/src/components/ReaderPage.tsx) | Wiring: toolbar button, keys |

The split between the class and its adapter follows [JavaScript / TypeScript](javascript-typescript.md). Selecting the text is covered by [Text selection](text-selection.md).

## Behaviour

- **Explain** in the selection toolbar closes the selection and opens the sheet straight away, showing the selected passage. The explanation streams in under it, with "Explaining…" until the first words arrive.
- Claude is given the book's title and author with the passage, and asked for a short explanation (two short paragraphs at most): what the passage means, and the context it needs from the book, without revealing anything that happens later. Spoilers were the most common flaw in otherwise accurate answers when this wasn't asked.
- **The language** comes from Settings → Explanation language: English (the default), Spanish, French, Portuguese, Russian, German, Italian, Polish, Ukrainian or Dutch, the ten European languages with the most speakers, listed by approximate total speakers worldwide (native plus second language, from Ethnologue), most first. It's independent of the book's language, so a Russian novel can be explained in English. Each language is listed by its own name, so it's recognisable whatever language the app is in. The setting is kept per device.
- **Closing the sheet:** swipe down on its header (a short swipe springs back), the close button, a tap outside it, or Escape (after an open image, footnote or TOC, before leaving the reader). Closing cancels a reply still streaming.
- While the sheet is open, the page-turn keys do nothing.
- A failed request (no API key on the server, network error) shows its error in the sheet, under the passage. A reply cut off for length or declined by Claude shows a short notice.

## Design

### The server owns the prompt

The client sends the passage, title, author and a language code; the server builds the prompt. The prompt can change without a client release, and the request schema accepts only the listed language codes and bounded text, so the endpoint can't be used as a general-purpose proxy to Claude.

### One stream format for chat and explanation

`POST /api/explain` streams the same `ChatStreamEvent`s as `POST /api/chat`. The client reads both with one reader (`readChatEventStream`), and the manager builds the reply with the chat's `applyChatStreamEvent`, so the explanation renders with the chat's `ChatMessageContent` and skips block types the client doesn't know in the same way.

### Model and refusals

The route calls Claude Opus 5.5 at `low` effort with `max_tokens` 4,000. In a blind comparison on ten passages from Anna Karenina, it scored 8.6–9.4 out of 10 against 6.3–7.0 for Sonnet 5.5 (low) and Haiku 5.5 (medium), and was the only one that never named the wrong speaker or scene; for a feature whose value is knowing the book, that outweighs Sonnet's lower price. Low effort keeps thinking short, so the reply starts sooner, and 4,000 tokens caps the cost of a call at about $0.08. The system prompt asks for at most two short paragraphs, since the reply streams and its length decides how long the reader waits. A passage from a novel can touch on violence or medicine, which a safety classifier may decline. Server-side refusal fallbacks (`fallbacks: "default"`) re-run a declined request on a fallback model instead of leaving the reader with nothing; only text blocks are forwarded, so fallback markers never reach the client.

### One request at a time

The manager keeps one `AbortController` per request. Closing the sheet or explaining another passage aborts the request in flight, and events or errors from an aborted request are dropped, so an old reply never shows up in a newer sheet.

Aborting closes the connection, and the server stops Claude when that happens (`abortOnDisconnect`, shared with the chat route). Otherwise Claude would keep generating, and billing, until the reply ended, so opening and closing the sheet quickly would pay for every full explanation.

## Invariants

- **The sheet must not re-mount while it's open.** Its `<Show>` stays non-keyed: the explanation is a new object on every streamed chunk, and a keyed `<Show>` would rebuild the sheet each time, losing a swipe in progress and the scroll position.
- **Only the header starts a swipe.** The body scrolls, and a downward drag there has to scroll the text back up. The header has `touch-action: none`, otherwise the browser claims the vertical drag as a scroll and cancels the pointer mid-swipe.
- **The close button is excluded from the swipe.** The header captures the pointer on press, which would retarget the button's click to the header.
- **`takeSelectedText` returns '' once the selection is gone.** A tap fires both `touchend` and `click` on the toolbar button; the second call finds no selection and explains nothing.

## Not supported

- Follow-up questions about an explanation; the Chat page covers open-ended questions.
- Context beyond the passage, title and author (e.g. the surrounding pages).
- Keeping explanations after the sheet closes.
- Translating the app's own interface; only the explanation follows the language setting.

## Testing

`ExplanationManager` is tested with a fake request function, covering streaming, errors, closing and replacing a request in flight. The route's prompt and request validation are tested without calling Claude. The sheet's swipe and the toolbar wiring need a browser: the screenshot script opens the sheet with a canned reply, and a swipe can be driven with Playwright's mouse; a touch swipe needs a real device.
