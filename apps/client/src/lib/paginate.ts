export type Note = { title?: string; text: string };
export type NoteRef = { noteId: string; label: string };
export type RichParagraph = (string | NoteRef)[];

/**
 * Vertical gap produced by FB2 <empty-line/>; rendered as a fixed-height blank
 * block.
 */
export const ParagraphType = {
  EmptyLine: 'EMPTY_LINE',
} as const;

export type EmptyLine = { type: typeof ParagraphType.EmptyLine };
export type BookParagraph = RichParagraph | EmptyLine;

export function isEmptyLine(paragraph: BookParagraph): paragraph is EmptyLine {
  return 'type' in paragraph && paragraph.type === ParagraphType.EmptyLine;
}

export type SectionItem =
  | { level?: number; title?: string; paragraphs: BookParagraph[] }

export type PageItem =
  | { title?: never; level?: never; type?: never; content: RichParagraph; noIndent: boolean }
  | { title: string; level: number; content?: never; noIndent?: never; type?: never }
  | { type: typeof ParagraphType.EmptyLine; title?: never; level?: never; content?: never; noIndent?: never };

export type Page = PageItem[];
