export type BookFormat = 'epub' | 'fb2';

export type Book = {
  id: string;
  name: string;
  author?: string;
  lang?: string;
  format: BookFormat;
  totalPages: number;
  addedAt: number;
  /**
   * Small JPEG thumbnail of the book cover as a data URL, when the file has one.
   */
  cover?: string;
};

export type Progress = {
  bookId: string;
  bookName: string;
  currentPage: number;
  totalPages: number;
  percent: number;
  lastRead: number;
  finished: boolean;
  smbPath?: string;
};

export type SMBConfig = {
  ip: string;
  port: number;
  username: string;
  password: string;
  share: string;
};

/**
 * SMBConfig without the password, the only shape the server ever sends to the client.
 *
 * TODO: Infer this type from the smbConfigSummarySchema instead of duplicating it here.
 */
export type SMBConfigSummary = {
  ip: string;
  port: number;
  username: string;
  share: string;
};

export type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
};

export type ApiError = {
  error: string;
};

// A message is a list of blocks rather than a string so richer replies (cards,
// links, content from external services) can be added later without changing
// the message shape. This list is the single source of truth for block types:
// adding one here makes every place that handles blocks fail to compile until
// it handles the new type, starting with ChatContentBlockFields below.
export const SUPPORTED_CHAT_CONTENT_BLOCK_TYPES = ['text'] as const;
export type ChatContentBlockType = (typeof SUPPORTED_CHAT_CONTENT_BLOCK_TYPES)[number];

// The fields each block type carries besides `type`.
type ChatContentBlockFields = {
  text: { text: string };
};

export type ChatContentBlock = {
  [Type in ChatContentBlockType]: { type: Type } & ChatContentBlockFields[Type];
}[ChatContentBlockType];

export type ChatTextBlock = Extract<ChatContentBlock, { type: 'text' }>;

// For data from the other app, which can run a different version and so know
// block types this one doesn't.
export function isSupportedChatContentBlockType(type: string): type is ChatContentBlockType {
  return (SUPPORTED_CHAT_CONTENT_BLOCK_TYPES as readonly string[]).includes(type);
}

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: ChatContentBlock[];
};

export type ChatRequest = {
  messages: ChatMessage[];
};

export type ChatStopReason =
  // The reply is complete.
  | 'end_turn'
  // The reply was cut off by the output or context-window limit.
  | 'max_tokens'
  // Claude declined to answer; the reply may be empty or partial.
  | 'refusal';

// Events of the `POST /api/chat` Server-Sent Events stream, each sent as
// `event: <type>` + `data: <the whole event as JSON>`.
//
// Blocks stream one after another: a `block_start` opens a block, and every
// delta that follows belongs to it until the next `block_start`. A block that
// arrives whole (e.g. a future card) needs no deltas. Clients must ignore event
// and block types they don't know, because the client and server deploy
// separately and the server may ship a new block type first.
export type ChatStreamEvent =
  | { type: 'block_start'; block: ChatContentBlock }
  | { type: 'text_delta'; text: string }
  | { type: 'message_end'; stopReason: ChatStopReason }
  | { type: 'error'; error: string };

// Languages Claude can explain a selected passage in. The setting picks one by
// `code`; the server tells Claude the `englishName`, and the settings list
// shows each language by its own name, so it's recognisable whatever language
// the app is in.
//
// Sorted by approximate total speakers worldwide (native plus second
// language, rounded from Ethnologue), most first, and the settings list keeps
// this order, so the most likely choices come first. A new language goes in
// at its place by speakers, not at the end.
export const EXPLANATION_LANGUAGES = [
  { code: 'en', englishName: 'English', nativeName: 'English' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español' },
  { code: 'fr', englishName: 'French', nativeName: 'Français' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch' },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano' },
  { code: 'pl', englishName: 'Polish', nativeName: 'Polski' },
  { code: 'uk', englishName: 'Ukrainian', nativeName: 'Українська' },
  { code: 'nl', englishName: 'Dutch', nativeName: 'Nederlands' },
] as const;

export type ExplanationLanguageCode = (typeof EXPLANATION_LANGUAGES)[number]['code'];

export const DEFAULT_EXPLANATION_LANGUAGE: ExplanationLanguageCode = 'en';

export function isExplanationLanguageCode(code: unknown): code is ExplanationLanguageCode {
  return EXPLANATION_LANGUAGES.some((language) => language.code === code);
}

export type ExplainRequest = {
  // The selected passage, as the reader copied it.
  passage: string;
  bookName: string;
  author?: string;
  language: ExplanationLanguageCode;
};

// `POST /api/explain` replies with the same Server-Sent Events as
// `POST /api/chat` (ChatStreamEvent), so both share one client-side reader.
