# Chat

The Chat page: a conversation with the AI, reached from the Home header. This spec covers when the page and the AI provider setting are offered, based on which providers the server has keys for.

## Where it lives

| File | Role |
|---|---|
| [`apps/server/src/lib/ai-provider.ts`](../apps/server/src/lib/ai-provider.ts) | `providerUnavailableError`: the check that a provider has its key |
| [`apps/server/src/routes/ai-providers.ts`](../apps/server/src/routes/ai-providers.ts) | `GET /api/ai-providers`: the providers the server can use |
| [`apps/server/src/routes/chat.ts`](../apps/server/src/routes/chat.ts) | `POST /api/chat`: the conversation and its stream |
| [`apps/client/src/lib/api/fetchAiProviders.ts`](../apps/client/src/lib/api/fetchAiProviders.ts) | Client call to `GET /api/ai-providers` |
| [`apps/client/src/lib/resolve-effective-ai-provider.ts`](../apps/client/src/lib/resolve-effective-ai-provider.ts) | `resolveEffectiveAiProvider`: the provider a request uses |
| [`apps/client/src/store/books.ts`](../apps/client/src/store/books.ts) | `availableAiProviders` and `BookStore.loadAiProviders()` |
| [`apps/client/src/main.tsx`](../apps/client/src/main.tsx) | Starts the availability fetch at launch |
| [`apps/client/src/components/HomePage.tsx`](../apps/client/src/components/HomePage.tsx) | The Chat icon in the Home header |
| [`apps/client/src/components/ChatPage.tsx`](../apps/client/src/components/ChatPage.tsx) | The Chat page |
| [`apps/client/src/components/SelectionToolbar.tsx`](../apps/client/src/components/SelectionToolbar.tsx) | The Explain button, shown only when a provider is available |
| [`apps/client/src/settings/tree.ts`](../apps/client/src/settings/tree.ts) | The Settings tree, including the AI provider and explanation language pages' availability |
| [`apps/client/src/components/settings/AiProviderSettings.tsx`](../apps/client/src/components/settings/AiProviderSettings.tsx) | The AI provider choice |

The provider choice and the Explain action are covered by [Explanation](explanation.md).

## Behaviour

- **Available** means the server has that provider's API key: `ANTHROPIC_API_KEY` for Claude, `GEMINI_API_KEY` for Gemini. Keys are read when the server starts, so a change takes effect after a server restart and an app reload.
- **Chat icon:** shown in the Home header only when the available list is known and has at least one provider. While the list is loading, or if loading failed, the icon is hidden. An icon should appear only when it can work, and a server that can't be reached can't chat either.
- **`/chat` by direct URL:** redirects home (`replace`) once the list is known to be empty. While the list is unknown the page opens, so a bookmark isn't lost during the startup fetch. A real failure still shows the server's error on the page.
- **Settings → Explanation language:** listed in the Settings menu only when at least one provider is available, since only Explain uses the language. Its direct URL follows the same rule as AI provider below, with one provider as the threshold.
- **Settings → AI provider:** listed in the Settings menu only when at least two providers are available. It lists only the available providers, because an unavailable one could only produce errors.
  - A direct URL (`/settings/ai-provider`) redirects to `/settings` once the list is known to have fewer than two providers. While the list is unknown the page opens, for the same bookmark reason.
- **Effective provider:** a request uses the stored choice if that provider is available. Otherwise it uses the first available provider in `AI_PROVIDERS` order. With one provider there is no real choice, so a stored `claude` doesn't break a Gemini-only server. If the list is unknown or empty, the stored choice is sent as before.
- **Explain button:** the reader's selection toolbar shows Explain only when at least one provider is available, under the same rule as the Chat icon: an unknown list hides it.
- Chat and Explain both send the effective provider.

## Design

### The server owns the truth

`GET /api/ai-providers` returns `{ "providers": ["claude", …] }`. It is built from the same checks as `providerUnavailableError`, so the list and a real request can't disagree. It never returns key values.

### Client state

`availableAiProviders` is `AiProviderCode[] | null` in the store, where `null` means unknown. It is never persisted. `BookStore.loadAiProviders()` runs next to `loadSMBStatus()` at launch, following that pattern: a failure is logged and leaves the value `null`. The fetch helper lives in `lib/api/` and, like `fetchServerVersion`, never throws.

### Two rules for an unknown list, on purpose

An affordance (the icon, a menu entry) shows only when the list is known to work. A direct URL is blocked only when the list is known not to work. This avoids both a flicker of dead buttons and redirecting a valid bookmark before the fetch returns.

### Settings tree

`settings/tree.ts` is a static constant. Page nodes take an optional availability predicate that returns `true`, `false` or `null` (unknown). `SettingsMenu` lists a node only for `true`. `resolveSettingsPath` treats only `false` as not found, so the existing redirect to `/settings` in `SettingsPage` handles a hidden page. The predicate reads the store, so it stays reactive.

### Effective provider as a pure function

`resolveEffectiveProvider({ storedProvider, availableProviders })` is a framework-free function used by `ChatPage` and the Explain wiring in `ReaderPage`. It follows [JavaScript / TypeScript](javascript-typescript.md), so it has a unit test without a UI.

## Invariants

- The Chat icon and the AI provider page are never shown while the list is unknown.
- A request never carries a provider the server reported as unavailable, when the list is known and not empty.
- The availability route never exposes key values.

## Not supported

- Live updates when a key changes without a server restart.
- Choosing a model per provider.

## Testing

- Unit tests: `resolveEffectiveProvider`, the availability predicate on the Settings tree, and the availability route (no keys gives an empty list; keys are set per provider).
- The icon, the menu entry and the redirects need a browser. Check them in the running app with zero, one and two keys set. Extend `scripts/take-screenshots.ts` only when a screen changes.
