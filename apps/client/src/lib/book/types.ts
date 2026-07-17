// raw elements
// TODO: review the names and how they relate to the PageElement types

export type Note = { title?: string; text: string };
export type NoteRef = { noteId: string; label: string };

/**
 * Inline text styling shared by every book format. The FB2 parser maps
 * <emphasis>/<strong> onto these flags; an EPUB parser can map
 * <em>/<i>/<strong>/<b> onto the same flags. Add new fields here to support
 * more inline styles across formats.
 */
export type TextStyle = {
  italic?: boolean;
  bold?: boolean;
};

export function hasAnyStyle(style: TextStyle): boolean {
  return Boolean(style.italic || style.bold);
}

/** A run of paragraph text carrying at least one TextStyle flag. */
export type RichText = { text: string; style: TextStyle };

export type Paragraph = (string | RichText | NoteRef)[];

export function isNoteRef(span: unknown): span is NoteRef {
  return typeof span === 'object' && span !== null && 'noteId' in span;
}

/**
 * Vertical gap produced by FB2 <empty-line/>; rendered as a fixed-height blank
 * block.
 */
export type EmptyLine = { type: typeof PageElementType.EmptyLine };
/**
 * Block-level FB2 <image l:href="#id"/> pointing at a <binary id="..."> element.
 */
export type BookImage = { type: typeof PageElementType.Image; imageId: string };
export type BookParagraph = Paragraph | EmptyLine | BookImage;

// A <binary> image decoded for rendering: data URL plus intrinsic pixel size.
export type BookImageAsset = { dataUrl: string; width: number; height: number };

export function isEmptyLine(paragraph: BookParagraph): paragraph is EmptyLine {
  return 'type' in paragraph && paragraph.type === PageElementType.EmptyLine;
}

export function isImage(paragraph: BookParagraph): paragraph is BookImage {
  return 'type' in paragraph && paragraph.type === PageElementType.Image;
}

export type SectionItem =
  | { level?: number; title?: string; paragraphs: BookParagraph[] }

/**
 * Format-independent result of parsing a book file. Parsers that have no
 * notes or images return empty records rather than omitting the fields.
 */
export type ParsedBook = {
  title: string;
  author?: string;
  lang?: string;
  sections: SectionItem[];
  notes: Record<string, Note>;
  // Data URLs keyed by image id, referenced from BookImage paragraphs.
  images: Record<string, string>;
};

// page elements

export const PageElementType = {
  EmptyLine: 'EMPTY_LINE',
  Heading: 'HEADING',
  Image: 'IMAGE',
  Paragraph: 'PARAGRAPH',
} as const;

export type PageParagraphElement = {
  content: Paragraph;
  noIndent: boolean;
  type: typeof PageElementType.Paragraph;
  // TODO: create via XOR type utility
  imageHeight?: never; 
  imageId?: never;
  level?: never;
  title?: never;
};

export type PageHeadingElement = {
  level: number;
  title: string;
  type: typeof PageElementType.Heading;
  // TODO: create via XOR type utility
  content?: never;
  imageHeight?: never;
  imageId?: never;
  noIndent?: never;
}

export type PageEmptyLineElement = {
  type: typeof PageElementType.EmptyLine;
  // TODO: create via XOR type utility
  content?: never;
  imageHeight?: never;
  imageId?: never;
  level?: never;
  noIndent?: never;
  title?: never;
}

export type PageImageElement = {
  imageHeight: number;
  imageId: string;
  type: typeof PageElementType.Image;
  // TODO: create via XOR type utility
  content?: never;
  level?: never;
  noIndent?: never;
  title?: never;
};

export type PageElement =
  | PageParagraphElement
  | PageHeadingElement
  | PageEmptyLineElement
  | PageImageElement;

export type Page = PageElement[];