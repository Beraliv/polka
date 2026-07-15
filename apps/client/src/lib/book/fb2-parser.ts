import { ParagraphType } from './types.ts';
import type { ParsedBook, SectionItem, RichParagraph, BookParagraph, NoteRef, Note } from './types.ts';

// Resolves the id referenced by an FB2 link attribute (l:href / xlink:href / href).
function linkedResourceId(el: Element): string | undefined {
  const href =
    el.getAttribute('l:href') ??
    el.getAttribute('xlink:href') ??
    el.getAttribute('href') ??
    '';
  const id = href.startsWith('#') ? href.slice(1) : href;
  return id || undefined;
}

function getTitle(section: Element): string | undefined {
  const titleEl = section.querySelector(':scope > title');
  if (!titleEl) return undefined;
  const parts: string[] = [];
  titleEl.querySelectorAll('p').forEach((p) => {
    const text = p.textContent?.trim();
    if (text) parts.push(text);
  });
  return parts.join(' ') || undefined;
}

function parseParagraphElement(el: Element): RichParagraph {
  const segments: RichParagraph = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) segments.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      const tag = child.tagName.toLowerCase();
      if (tag === 'a' && child.getAttribute('type') === 'note') {
        const noteId = linkedResourceId(child);
        const label = child.textContent?.trim() ?? '';
        if (noteId && label) {
          segments.push({ noteId, label } satisfies NoteRef);
        }
      } else {
        segments.push(...parseParagraphElement(child));
      }
    }
  }
  return segments;
}

function parseImageElement(el: Element): BookParagraph | undefined {
  const imageId = linkedResourceId(el);
  return imageId ? { type: ParagraphType.Image, imageId } : undefined;
}

// A <p>/<v> may wrap illustrations (<p><image .../></p>); emit those as
// standalone image paragraphs ahead of the remaining text, if any.
function collectTextParagraph(el: Element, out: BookParagraph[]): void {
  el.querySelectorAll('image').forEach((imageEl) => {
    const image = parseImageElement(imageEl);
    if (image) out.push(image);
  });
  const paragraph = parseParagraphElement(el);
  if (paragraph.length > 0) out.push(paragraph);
}

// Collect all <p>/<v>/<empty-line>/<image> descendants of el, skipping <annotation>, <title>, and nested <section> subtrees.
function collectParagraphs(el: Element, out: BookParagraph[]): void {
  for (const child of el.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'p' || tag === 'v') {
      collectTextParagraph(child, out);
    } else if (tag === 'empty-line') {
      out.push({ type: ParagraphType.EmptyLine });
    } else if (tag === 'image') {
      const image = parseImageElement(child);
      if (image) out.push(image);
    } else if (tag !== 'annotation' && tag !== 'title' && tag !== 'section') {
      collectParagraphs(child, out);
    }
  }
}

// Collect <p>/<v>/<empty-line>/<image> from a section's direct non-title, non-section, non-annotation children.
function collectDirectParagraphs(section: Element): BookParagraph[] {
  const out: BookParagraph[] = [];
  for (const child of section.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'title' || tag === 'section' || tag === 'annotation') continue;
    if (tag === 'p' || tag === 'v') {
      collectTextParagraph(child, out);
    } else if (tag === 'empty-line') {
      out.push({ type: ParagraphType.EmptyLine });
    } else if (tag === 'image') {
      const image = parseImageElement(child);
      if (image) out.push(image);
    } else {
      // poem, epigraph, cite, etc. — grab all p/v/empty-line/image descendants
      child.querySelectorAll('p, v, empty-line, image').forEach((el) => {
        const nestedTag = el.tagName.toLowerCase();
        if (nestedTag === 'empty-line') {
          out.push({ type: ParagraphType.EmptyLine });
          return;
        }
        if (nestedTag === 'image') {
          const image = parseImageElement(el);
          if (image) out.push(image);
          return;
        }
        const paragraph = parseParagraphElement(el);
        if (paragraph.length > 0) out.push(paragraph);
      });
    }
  }
  return out;
}

function childSections(el: Element): Element[] {
  return Array.from(el.children).filter((childEl) => childEl.tagName.toLowerCase() === 'section');
}

type CollectSectionsOptions = { section: Element; level: number; out: SectionItem[] };

function collectSections({ section, level, out }: CollectSectionsOptions): void {
  if (level > 5) {
    return;
  }
  const title = getTitle(section);
  const paragraphs = collectDirectParagraphs(section);
  if (title || paragraphs.length > 0) {
    out.push({ level, title, paragraphs });
  }
  for (const child of childSections(section)) {
    collectSections({ section: child, level: level + 1, out });
  }
}

function parseNotes(doc: Document): Record<string, Note> {
  const notes: Record<string, Note> = {};
  const notesBody = doc.querySelector('FictionBook > body[name="notes"]');
  if (!notesBody) return notes;
  notesBody.querySelectorAll('section[id]').forEach((section) => {
    const id = section.getAttribute('id');
    if (!id) return;

    const titleEl = section.querySelector(':scope > title');
    const titleParts: string[] = [];
    titleEl?.querySelectorAll('p').forEach((paragraphEl) => {
      const text = paragraphEl.textContent?.trim();
      if (text) titleParts.push(text);
    });
    const title = titleParts.join(' ') || undefined;

    const textParts: string[] = [];
    for (const child of section.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'title' || tag === 'section') continue;
      if (tag === 'p' || tag === 'v') {
        const text = child.textContent?.trim();
        if (text) textParts.push(text);
      } else {
        child.querySelectorAll('p, v').forEach((paragraphEl) => {
          const text = paragraphEl.textContent?.trim();
          if (text) textParts.push(text);
        });
      }
    }

    const text = textParts.join(' ');
    if (title || text) notes[id] = { title, text };
  });
  return notes;
}

// Turn each <binary id content-type>base64</binary> element into a data URL.
function parseBinaryImages(doc: Document): Record<string, string> {
  const images: Record<string, string> = {};
  doc.querySelectorAll('FictionBook > binary').forEach((binaryEl) => {
    const id = binaryEl.getAttribute('id');
    if (!id) return;
    const contentType = binaryEl.getAttribute('content-type');
    if (!contentType) return;
    const base64 = binaryEl.textContent?.replace(/\s+/g, '') ?? '';
    if (base64) images[id] = `data:${contentType};base64,${base64}`;
  });
  return images;
}

export function parseFB2(buffer: ArrayBuffer): ParsedBook {
  const xml = new TextDecoder('utf-8').decode(buffer);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const titleEl = doc.querySelector('book-title') ?? doc.querySelector('title > p');
  const title = titleEl?.textContent?.trim() ?? 'Unknown title';

  const firstNameEl = doc.querySelector('first-name');
  const lastNameEl = doc.querySelector('last-name');
  const author =
    [firstNameEl?.textContent, lastNameEl?.textContent].filter(Boolean).join(' ') || undefined;

  const lang = doc.querySelector('title-info > lang')?.textContent?.trim() || undefined;

  const notes = parseNotes(doc);
  const images = parseBinaryImages(doc);

  const sections: SectionItem[] = [];

  doc.querySelectorAll('FictionBook > body').forEach((body) => {
    if (body.getAttribute('name') === 'notes') return;

    const topSections = childSections(body);

    if (topSections.length === 0) {
      const paragraphs: BookParagraph[] = [];
      collectParagraphs(body, paragraphs);
      if (paragraphs.length > 0) sections.push({ paragraphs });
      return;
    }

    for (const topSection of topSections) {
      collectSections({ section: topSection, level: 1, out: sections });
    }
  });

  return { title, author, lang, sections, notes, images };
}
