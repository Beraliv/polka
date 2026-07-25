import { unzipSync } from 'fflate';
import { hasAnyStyle, PageElementType } from './types.ts';
import type { ParsedBook, SectionItem, TocEntry, Paragraph, BookParagraph, BookImage, NoteRef, Note, TextStyle } from './types.ts';

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

// XHTML producers sometimes self-close elements that HTML's parser doesn't
// treat as void, e.g. <title/>. For RCDATA/RAWTEXT elements (title, style,
// script, textarea) that's catastrophic in 'text/html' mode: the parser
// treats "/>" as plain text and keeps consuming everything up to the next
// literal closing tag, swallowing the rest of the document (including
// <body>). Rewrite them to explicit empty pairs before parsing.
const SELF_CLOSING_RCDATA_TAG_PATTERN = /<(title|style|script|textarea)((?:\s+[^<>]*)?)\/>/gi;

function fixSelfClosingRcdataTags(xhtml: string): string {
  return xhtml.replace(SELF_CLOSING_RCDATA_TAG_PATTERN, '<$1$2></$1>');
}

// href/src attributes are URIs, so producers that emit non-ASCII or reserved
// characters in file names (e.g. Adobe InDesign's EPUB export) percent-encode
// them: "СССР.xhtml" becomes "%D0%A1%D0%A1%D0%A1%D0%A0.xhtml". The zip's own
// entry names are the literal, un-encoded names, so hrefs must be decoded
// before matching against them. A malformed percent sequence (a stray "%" in
// an otherwise plain path) must not abort parsing — fall back to the raw
// string, which still works for the plenty of EPUBs that never encode hrefs.
function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
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

type DecodeInTextImagesOptions = { paths: Set<string>; files: Record<string, Uint8Array> };

// Decodes every in-text image referenced from the reading flow into a data
// URL, keyed by its archive path (the same path used as BookImage.imageId).
// A missing file or an unrecognized extension just drops that one image
// rather than aborting the parse.
function decodeInTextImages({ paths, files }: DecodeInTextImagesOptions): Record<string, string> {
  const images: Record<string, string> = {};
  for (const path of paths) {
    const bytes = files[path];
    if (!bytes) continue;
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    const mediaType = IMAGE_MEDIA_TYPE_BY_EXTENSION[extension];
    if (!mediaType) continue;
    images[path] = `data:${mediaType};base64,${bytesToBase64(bytes)}`;
  }
  return images;
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
  for (const segment of (baseDir + decodeHref(rawPath)).split('/')) {
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

// An unresolved TOC entry: a title/level pair pointing at an href, before
// that href has been matched to a parsed section.
type TocEntryDraft = { title: string; level: number; path: string; fragment?: string };

function childrenNamed(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName.toLowerCase() === localName);
}

type ParseNcxTocOptions = { ncxDoc: Document; ncxPath: string };

// Walks an EPUB 2 NCX <navMap>: navPoints nest to express TOC depth, each
// carrying a <navLabel><text> and a <content src> pointing at the target
// document (optionally with a fragment).
function parseNcxToc({ ncxDoc, ncxPath }: ParseNcxTocOptions): TocEntryDraft[] {
  const entries: TocEntryDraft[] = [];
  const navMap = childrenNamed(ncxDoc.documentElement, 'navmap')[0];
  if (!navMap) return entries;

  function walk(parent: Element, level: number) {
    for (const navPoint of childrenNamed(parent, 'navpoint')) {
      const navLabel = childrenNamed(navPoint, 'navlabel')[0];
      const title = navLabel ? childrenNamed(navLabel, 'text')[0]?.textContent?.trim() : undefined;
      const src = childrenNamed(navPoint, 'content')[0]?.getAttribute('src');
      if (title && src) {
        const target = splitHref({ documentPath: ncxPath, href: src });
        entries.push({ title, level, path: target.path, fragment: target.fragment });
      }
      walk(navPoint, level + 1);
    }
  }
  walk(navMap, 1);
  return entries;
}

type ParseNavTocOptions = { navDoc: Document; navPath: string };

// Walks an EPUB 3 nav document: a <nav epub:type="toc"> wrapping a nested
// <ol>/<li>/<a> tree, where <ol> nesting expresses TOC depth.
function parseNavToc({ navDoc, navPath }: ParseNavTocOptions): TocEntryDraft[] {
  const entries: TocEntryDraft[] = [];
  const navs = Array.from(navDoc.querySelectorAll('nav'));
  const tocNav = navs.find((nav) => getEpubType(nav).includes('toc')) ?? navs[0];
  const rootOl = tocNav ? Array.from(tocNav.children).find((child) => child.tagName.toLowerCase() === 'ol') : undefined;
  if (!rootOl) return entries;

  function walk(ol: Element, level: number) {
    for (const li of Array.from(ol.children).filter((child) => child.tagName.toLowerCase() === 'li')) {
      const anchor = Array.from(li.children).find((child) => child.tagName.toLowerCase() === 'a');
      const href = anchor?.getAttribute('href');
      const title = anchor?.textContent?.trim();
      if (href && title) {
        const target = splitHref({ documentPath: navPath, href });
        entries.push({ title, level, path: target.path, fragment: target.fragment });
      }
      const nestedOl = Array.from(li.children).find((child) => child.tagName.toLowerCase() === 'ol');
      if (nestedOl) walk(nestedOl, level + 1);
    }
  }
  walk(rootOl, 1);
  return entries;
}

type ResolveTocEntriesOptions = { drafts: TocEntryDraft[]; sectionIndexByPath: Map<string, number> };

// Drops entries whose target isn't a parsed section — e.g. it points at a
// non-linear document, or a document that produced no section at all.
// Fragments are not resolved to a position inside the section: TOC entries
// point at whichever section their target document became.
function resolveTocEntries({ drafts, sectionIndexByPath }: ResolveTocEntriesOptions): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const draft of drafts) {
    const sectionIndex = sectionIndexByPath.get(draft.path);
    if (sectionIndex === undefined) continue;
    entries.push({ title: draft.title, level: draft.level, sectionIndex });
  }
  return entries;
}

// A book with no titled headings still needs SOME table of contents, and a
// book with a broken/absent NCX or nav document is common enough in the
// wild. Falls back to the previous heading-derived behavior.
function fallbackTocFromHeadings(sections: SectionItem[]): TocEntry[] {
  const entries: TocEntry[] = [];
  sections.forEach((section, sectionIndex) => {
    if (section.title) entries.push({ title: section.title, level: section.level ?? 1, sectionIndex });
  });
  return entries;
}

type BuildTocOptions = {
  opfDoc: Document;
  manifest: Map<string, string>;
  files: Record<string, Uint8Array>;
  sections: SectionItem[];
  sectionIndexByPath: Map<string, number>;
};

// Prefers the EPUB 3 nav document, then the EPUB 2 NCX, then falls back to
// deriving the TOC from section headings — trying each source in turn and
// keeping the first that resolves to at least one entry.
function buildToc({ opfDoc, manifest, files, sections, sectionIndexByPath }: BuildTocOptions): TocEntry[] {
  const navId = opfDoc.querySelector('manifest > item[properties~="nav"]')?.getAttribute('id');
  const navPath = navId ? manifest.get(navId) : undefined;
  const navBytes = navPath ? files[navPath] : undefined;
  if (navPath && navBytes) {
    const navDoc = new DOMParser().parseFromString(fixSelfClosingRcdataTags(decode(navBytes)), 'text/html');
    const resolved = resolveTocEntries({ drafts: parseNavToc({ navDoc, navPath }), sectionIndexByPath });
    if (resolved.length > 0) return resolved;
  }

  const ncxId = opfDoc.querySelector('spine')?.getAttribute('toc');
  const ncxPath = ncxId ? manifest.get(ncxId) : undefined;
  const ncxBytes = ncxPath ? files[ncxPath] : undefined;
  if (ncxPath && ncxBytes) {
    const ncxDoc = new DOMParser().parseFromString(decode(ncxBytes), 'application/xml');
    const resolved = resolveTocEntries({ drafts: parseNcxToc({ ncxDoc, ncxPath }), sectionIndexByPath });
    if (resolved.length > 0) return resolved;
  }

  return fallbackTocFromHeadings(sections);
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

type ExtractImageParagraphOptions = { documentPath: string; imgEl: Element; imagePathsUsed: Set<string> };

// Resolves an <img src> to its archive path — used as both the id recorded
// for the later decode-to-data-URL pass and the BookImage.imageId that
// looks it up again at render time.
function extractImageParagraph({
  documentPath,
  imgEl,
  imagePathsUsed,
}: ExtractImageParagraphOptions): BookImage | undefined {
  const src = imgEl.getAttribute('src');
  if (!src) return undefined;
  const path = splitHref({ documentPath, href: src }).path;
  if (!path) return undefined;
  imagePathsUsed.add(path);
  return { type: PageElementType.Image, imageId: path };
}

type ExtractSectionItemOptions = {
  spineDocument: SpineDocument;
  noteCollection: NoteCollection;
  imagePathsUsed: Set<string>;
};

function extractSectionItem({
  spineDocument,
  noteCollection,
  imagePathsUsed,
}: ExtractSectionItemOptions): SectionItem | undefined {
  const { path, document } = spineDocument;

  // First heading element becomes the section title
  const headingEl = document.querySelector('h1, h2, h3');
  const title = headingEl?.textContent?.trim() || undefined;

  const paragraphs: BookParagraph[] = [];
  let skippedNoteBodies = 0;
  document.querySelectorAll('p, li, blockquote, img').forEach((el) => {
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      // Images nested inside a p/li/blockquote are extracted alongside that
      // element below (ahead of its text), not here — this branch is only
      // for images that stand alone, e.g. <div><img/></div> with no
      // wrapping paragraph. (An image that's a bare, non-<p>-wrapped child
      // of a verse-style blockquote falls through both branches and is
      // dropped — an accepted gap, not seen in practice.)
      if (el.closest('p, li, blockquote')) return;
      if (isInsideNoteBody({ element: el, documentPath: path, noteBodyKeys: noteCollection.noteBodyKeys })) return;
      const image = extractImageParagraph({ documentPath: path, imgEl: el, imagePathsUsed });
      if (image) paragraphs.push(image);
      return;
    }

    if (tag === 'blockquote') {
      // Only extract blockquotes that hold bare text (e.g. verse split by
      // <br>); ones built from <p>/<li> are covered by their children, and
      // nested blockquotes by their outermost ancestor.
      if (el.querySelector('p, li') || el.parentElement?.closest('blockquote')) return;
    }
    if (isInsideNoteBody({ element: el, documentPath: path, noteBodyKeys: noteCollection.noteBodyKeys })) {
      skippedNoteBodies += 1;
      return;
    }

    el.querySelectorAll('img').forEach((imgEl) => {
      const image = extractImageParagraph({ documentPath: path, imgEl, imagePathsUsed });
      if (image) paragraphs.push(image);
    });

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
    if (id && href) manifest.set(id, opfDir + decodeHref(href));
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
      document: new DOMParser().parseFromString(fixSelfClosingRcdataTags(decode(bytes)), 'text/html'),
    });
  }

  const noteCollection = collectNotes(spineDocuments);

  const sections: SectionItem[] = [];
  const sectionIndexByPath = new Map<string, number>();
  const imagePathsUsed = new Set<string>();
  for (const spineDocument of spineDocuments) {
    if (!spineDocument.linear) continue;
    const section = extractSectionItem({ spineDocument, noteCollection, imagePathsUsed });
    if (section) {
      sectionIndexByPath.set(spineDocument.path, sections.length);
      sections.push(section);
    }
  }

  const toc = buildToc({ opfDoc, manifest, files, sections, sectionIndexByPath });

  const coverImage = extractCoverImage({ opfDoc, manifest, files });
  const images: Record<string, string> = {
    ...decodeInTextImages({ paths: imagePathsUsed, files }),
    ...(coverImage ? { [coverImage.coverImageId]: coverImage.dataUrl } : {}),
  };

  return { title, author, sections, toc, notes: noteCollection.notes, images, coverImageId: coverImage?.coverImageId };
}
