import { unzipSync } from 'fflate';
import { hasAnyStyle } from './types.ts';
import type { ParsedBook, SectionItem, Paragraph, NoteRef, Note, TextStyle } from './types.ts';

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked to stay under the engine's argument-count limit for apply().
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const IMAGE_MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

type ExtractCoverImageOptions = {
  opfDoc: Document;
  manifest: Map<string, string>;
  files: Record<string, Uint8Array>;
};

type CoverImage = { coverImageId: string; dataUrl: string };

// Finds the cover declared in the OPF — EPUB 3 marks the manifest item with
// properties="cover-image", EPUB 2 names its id in <meta name="cover"> — and
// decodes that file into a data URL.
function extractCoverImage({ opfDoc, manifest, files }: ExtractCoverImageOptions): CoverImage | undefined {
  const epub3Item = opfDoc.querySelector('manifest > item[properties~="cover-image"]');
  const epub2CoverId = opfDoc.querySelector('metadata > meta[name="cover"]')?.getAttribute('content');
  // The EPUB 2 id is matched by scanning the manifest, not via a selector
  // string: a malformed content value must not abort parsing with an invalid
  // selector, it should just mean "no cover".
  const coverItem =
    epub3Item ??
    (epub2CoverId
      ? Array.from(opfDoc.querySelectorAll('manifest > item')).find(
          (item) => item.getAttribute('id') === epub2CoverId,
        )
      : undefined);
  if (!coverItem) return undefined;

  const coverImageId = coverItem.getAttribute('id');
  if (!coverImageId) return undefined;
  const coverPath = manifest.get(coverImageId);
  if (!coverPath) return undefined;
  const coverBytes = files[coverPath];
  if (!coverBytes) return undefined;

  const extension = coverPath.split('.').pop()?.toLowerCase() ?? '';
  const mediaType = coverItem.getAttribute('media-type') || IMAGE_MEDIA_TYPE_BY_EXTENSION[extension];
  if (!mediaType?.startsWith('image/')) return undefined;

  return { coverImageId, dataUrl: `data:${mediaType};base64,${bytesToBase64(coverBytes)}` };
}

// linear=false marks auxiliary documents (spine itemref linear="no", usually
// endnotes): they resolve note targets but stay out of the reading flow.
type SpineDocument = { path: string; document: Document; linear: boolean };

type HrefTarget = { path: string; fragment?: string };

type SplitHrefOptions = { documentPath: string; href: string };

// Resolves an href relative to the document that contains it, returning the
// archive path of the target file plus the fragment id, if any. "#id" points
// into the same document; "../notes.xhtml#id" is normalized against the
// document's directory.
function splitHref({ documentPath, href }: SplitHrefOptions): HrefTarget {
  const [rawPath, fragment] = href.split('#');
  if (!rawPath) return { path: documentPath, fragment };

  const baseDir = documentPath.includes('/')
    ? documentPath.slice(0, documentPath.lastIndexOf('/') + 1)
    : '';
  const segments: string[] = [];
  for (const segment of (baseDir + rawPath).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return { path: segments.join('/'), fragment };
}

function getEpubType(element: Element): string {
  return element.getAttribute('epub:type')?.toLowerCase() ?? '';
}

// Marker-style labels typical of footnote references: "1", "[2]", "*", "†".
const NOTE_LABEL_PATTERN = /^\[?[\d*†‡§]{1,4}\]?$/;

function looksLikeNoteLabel(label: string): boolean {
  return NOTE_LABEL_PATTERN.test(label);
}

// "Return to text" anchors inside note bodies: EPUB 3 marks them with
// epub:type="backlink"/"referrer"; EPUB 2 books use arrow glyphs or "back".
const BACKLINK_TEXT_PATTERN = /^[↩↑⏎←]|^\[?back\b/i;

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'td']);

function isBacklinkAnchor(anchor: Element): boolean {
  const epubType = getEpubType(anchor);
  if (epubType.includes('backlink') || epubType.includes('referrer')) return true;
  if (BACKLINK_TEXT_PATTERN.test(anchor.textContent?.trim() ?? '')) return true;
  // Language-agnostic fallback: a block whose entire content is a single link
  // ("Вернуться", "Retour", …) is a return link, whatever the wording.
  const parent = anchor.parentElement;
  if (!parent || !BLOCK_TAGS.has(parent.tagName.toLowerCase())) return false;
  return parent.textContent?.trim() === anchor.textContent?.trim();
}

function containsBacklink(element: Element): boolean {
  return Array.from(element.querySelectorAll('a')).some(isBacklinkAnchor);
}

// Heuristic for EPUB 2 books without noteref semantics: the link target has
// to look like a note body before we treat the link as a footnote reference.
function looksLikeNoteBody(element: Element): boolean {
  if (element.tagName.toLowerCase() === 'aside') return true;
  const epubType = getEpubType(element);
  if (epubType.includes('footnote') || epubType.includes('endnote')) return true;
  if (/\b(foot|end)?notes?\b/i.test(element.className)) return true;
  return containsBacklink(element);
}

function extractNoteText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('a').forEach((anchor) => {
    if (isBacklinkAnchor(anchor)) anchor.remove();
  });
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

type NoteCollection = {
  notes: Record<string, Note>;
  // Anchors recognized as note references, resolved ahead of section
  // extraction so the inline walker can emit NoteRef spans for them.
  noteRefByAnchor: Map<Element, NoteRef>;
  // "path#fragment" keys of elements that hold note bodies; their content is
  // shown in the popup and must be dropped from the reading flow.
  noteBodyKeys: Set<string>;
};

function collectNotes(spineDocuments: SpineDocument[]): NoteCollection {
  const notes: Record<string, Note> = {};
  const noteRefByAnchor = new Map<Element, NoteRef>();
  const noteBodyKeys = new Set<string>();

  const documentByPath = new Map<string, Document>();
  for (const { path, document } of spineDocuments) {
    documentByPath.set(path, document);
  }

  for (const { path, document } of spineDocuments) {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      // Skip absolute URLs (http:, mailto:, …) — only archive-local links
      // can be footnotes.
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;

      const target = splitHref({ documentPath: path, href });
      if (!target.fragment) return;
      const targetElement = documentByPath.get(target.path)?.getElementById(target.fragment);
      if (!targetElement) return;

      const label = anchor.textContent?.trim() ?? '';
      if (!label) return;

      const isExplicitNoteRef = getEpubType(anchor).includes('noteref');
      const isSuperscript = anchor.closest('sup') !== null || anchor.querySelector('sup') !== null;
      const matchesEndnoteHeuristic =
        (looksLikeNoteLabel(label) || isSuperscript) && looksLikeNoteBody(targetElement);
      if (!isExplicitNoteRef && !matchesEndnoteHeuristic) return;

      const text = extractNoteText(targetElement);
      if (!text) return;

      const noteId = `${target.path}#${target.fragment}`;
      // "[146]" → popup title "146", matching how FB2 notes are titled.
      const title = label.replace(/^\[|\]$/g, '');
      if (!notes[noteId]) notes[noteId] = { title, text };
      noteBodyKeys.add(noteId);
      noteRefByAnchor.set(anchor, { noteId, label });
    });
  }

  return { notes, noteRefByAnchor, noteBodyKeys };
}

const ITALIC_TAGS = new Set(['em', 'i']);
const BOLD_TAGS = new Set(['strong', 'b']);

type ParseInlineContentOptions = {
  element: Element;
  inheritedStyle: TextStyle;
  noteRefByAnchor: Map<Element, NoteRef>;
};

// Walks the inline content of a paragraph-like element, tracking the style
// accumulated from enclosing <em>/<i>/<strong>/<b> elements and emitting
// NoteRef spans for recognized footnote anchors.
function parseInlineContent({ element, inheritedStyle, noteRefByAnchor }: ParseInlineContentOptions): Paragraph {
  const segments: Paragraph = [];
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) continue;
      if (hasAnyStyle(inheritedStyle)) {
        segments.push({ text, style: inheritedStyle });
      } else {
        segments.push(text);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      const noteRef = noteRefByAnchor.get(child);
      if (noteRef) {
        segments.push(noteRef);
        continue;
      }
      const tag = child.tagName.toLowerCase();
      let childStyle = inheritedStyle;
      if (ITALIC_TAGS.has(tag)) childStyle = { ...childStyle, italic: true };
      if (BOLD_TAGS.has(tag)) childStyle = { ...childStyle, bold: true };
      segments.push(...parseInlineContent({ element: child, inheritedStyle: childStyle, noteRefByAnchor }));
    }
  }
  return segments;
}

type IsInsideNoteBodyOptions = {
  element: Element;
  documentPath: string;
  noteBodyKeys: Set<string>;
};

function isInsideNoteBody({ element, documentPath, noteBodyKeys }: IsInsideNoteBodyOptions): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const epubType = getEpubType(current);
    if (epubType.includes('footnote') || epubType.includes('endnote')) return true;
    if (current.id && noteBodyKeys.has(`${documentPath}#${current.id}`)) return true;
  }
  return false;
}

type ExtractSectionItemOptions = {
  spineDocument: SpineDocument;
  noteCollection: NoteCollection;
};

function extractSectionItem({ spineDocument, noteCollection }: ExtractSectionItemOptions): SectionItem | undefined {
  const { path, document } = spineDocument;

  // First heading element becomes the section title
  const headingEl = document.querySelector('h1, h2, h3');
  const title = headingEl?.textContent?.trim() || undefined;

  const paragraphs: Paragraph[] = [];
  let skippedNoteBodies = 0;
  document.querySelectorAll('p, li, blockquote').forEach((el) => {
    if (el.tagName.toLowerCase() === 'blockquote') {
      // Only extract blockquotes that hold bare text (e.g. verse split by
      // <br>); ones built from <p>/<li> are covered by their children, and
      // nested blockquotes by their outermost ancestor.
      if (el.querySelector('p, li') || el.parentElement?.closest('blockquote')) return;
    }
    if (isInsideNoteBody({ element: el, documentPath: path, noteBodyKeys: noteCollection.noteBodyKeys })) {
      skippedNoteBodies += 1;
      return;
    }
    if (!el.textContent?.trim()) return;
    const paragraph = parseInlineContent({
      element: el,
      inheritedStyle: {},
      noteRefByAnchor: noteCollection.noteRefByAnchor,
    });
    if (paragraph.length > 0) paragraphs.push(paragraph);
  });

  if (paragraphs.length === 0) {
    // A notes-only document (every paragraph consumed as a note body) should
    // not produce a section, even if it carries a "Notes" heading.
    if (skippedNoteBodies > 0 || !title) return undefined;
  }
  return { level: 1, title, paragraphs };
}

export function parseEPUB(buffer: ArrayBuffer): ParsedBook {
  const files = unzipSync(new Uint8Array(buffer));

  // Find the OPF file path from META-INF/container.xml
  const containerXml = files['META-INF/container.xml'];
  if (!containerXml) throw new Error('Not a valid EPUB: missing META-INF/container.xml');

  const containerDoc = new DOMParser().parseFromString(decode(containerXml), 'application/xml');
  const rootfilePath = containerDoc
    .querySelector('rootfile')
    ?.getAttribute('full-path');
  if (!rootfilePath) throw new Error('Cannot find rootfile in container.xml');

  // Parse the OPF
  const opfBytes = files[rootfilePath];
  if (!opfBytes) throw new Error(`OPF file not found: ${rootfilePath}`);
  const opfDoc = new DOMParser().parseFromString(decode(opfBytes), 'application/xml');

  // Metadata
  const title = opfDoc.querySelector('metadata > *|title, title')?.textContent?.trim() ?? 'Unknown title';
  const creatorEl = opfDoc.querySelector('metadata > *|creator, creator');
  const author = creatorEl?.textContent?.trim() || undefined;

  // Build id→href manifest map
  const opfDir = rootfilePath.includes('/') ? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, string>();
  opfDoc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, opfDir + href);
  });

  // Spine items in order
  const spineItems: { path: string; linear: boolean }[] = [];
  opfDoc.querySelectorAll('spine > itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref');
    if (idref) {
      const href = manifest.get(idref);
      if (href) spineItems.push({ path: href, linear: ref.getAttribute('linear') !== 'no' });
    }
  });

  // Parse every spine document up front: note references can point across
  // files (e.g. chapter → endnotes file), so targets must be resolvable
  // before section extraction.
  const spineDocuments: SpineDocument[] = [];
  for (const { path, linear } of spineItems) {
    const bytes = files[path];
    if (!bytes) continue;
    spineDocuments.push({
      path,
      linear,
      document: new DOMParser().parseFromString(decode(bytes), 'text/html'),
    });
  }

  const noteCollection = collectNotes(spineDocuments);

  const sections: SectionItem[] = [];
  for (const spineDocument of spineDocuments) {
    if (!spineDocument.linear) continue;
    const section = extractSectionItem({ spineDocument, noteCollection });
    if (section) sections.push(section);
  }

  // TODO: add EPUB support for in-text images; only the cover is extracted.
  const coverImage = extractCoverImage({ opfDoc, manifest, files });
  const images: Record<string, string> = coverImage
    ? { [coverImage.coverImageId]: coverImage.dataUrl }
    : {};

  return { title, author, sections, notes: noteCollection.notes, images, coverImageId: coverImage?.coverImageId };
}
