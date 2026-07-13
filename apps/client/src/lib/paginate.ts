export type Note = { title?: string; text: string };
export type NoteRef = { noteId: string; label: string };
export type RichParagraph = (string | NoteRef)[];

export type SectionItem =
  | { level?: number; title?: string; paragraphs: RichParagraph[] }

export type PageItem =
  | { title?: never; level?: never; content: RichParagraph; noIndent: boolean }
  | { title: string; level: number; content?: never; noIndent?: never };

export type Page = PageItem[];
