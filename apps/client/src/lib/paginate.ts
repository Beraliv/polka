export type Note = { title?: string; text: string };
export type NoteRef = { noteId: string; label: string };
export type RichParagraph = (string | NoteRef)[];

export const ParagraphType = {
  EmptyLine: 'EMPTY_LINE',
  Image: 'IMAGE',
} as const;

/**
 * Vertical gap produced by FB2 <empty-line/>; rendered as a fixed-height blank
 * block.
 */
export type EmptyLine = { type: typeof ParagraphType.EmptyLine };
/**
 * Block-level FB2 <image l:href="#id"/> pointing at a <binary id="..."> element.
 */
export type BookImage = { type: typeof ParagraphType.Image; imageId: string };
export type BookParagraph = RichParagraph | EmptyLine | BookImage;

// A <binary> image decoded for rendering: data URL plus intrinsic pixel size.
export type BookImageAsset = { dataUrl: string; width: number; height: number };

export function isEmptyLine(paragraph: BookParagraph): paragraph is EmptyLine {
  return 'type' in paragraph && paragraph.type === ParagraphType.EmptyLine;
}

export function isImage(paragraph: BookParagraph): paragraph is BookImage {
  return 'type' in paragraph && paragraph.type === ParagraphType.Image;
}

export type SectionItem =
  | { level?: number; title?: string; paragraphs: BookParagraph[] }

export type PageItem =
  | { title?: never; level?: never; type?: never; imageId?: never; imageHeight?: never; content: RichParagraph; noIndent: boolean }
  | { title: string; level: number; content?: never; noIndent?: never; type?: never; imageId?: never; imageHeight?: never }
  | { type: typeof ParagraphType.EmptyLine; title?: never; level?: never; content?: never; noIndent?: never; imageId?: never; imageHeight?: never }
  | { type: typeof ParagraphType.Image; imageId: string; imageHeight: number; title?: never; level?: never; content?: never; noIndent?: never };

export type Page = PageItem[];
