export type Note = { title?: string; text: string };
export type NoteRef = { noteId: string; label: string };
export type RichParagraph = (string | NoteRef)[];

export type SectionItem =
  | { level?: number; title?: string; paragraphs: RichParagraph[] }

export type PageItem =
  | { title?: never; level?: never; content: RichParagraph }
  | { title: string; level: number; content?: never };

export type Page = PageItem[];
