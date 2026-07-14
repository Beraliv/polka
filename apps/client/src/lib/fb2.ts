import { ParagraphType } from './paginate.ts';
import type { SectionItem, RichParagraph, BookParagraph, NoteRef, Note } from './paginate.ts';

export type ParsedBook = {
  title: string;
  author?: string;
  lang?: string;
  sections: SectionItem[];
  notes: Record<string, Note>;
};

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
        const href =
          child.getAttribute('l:href') ??
          child.getAttribute('xlink:href') ??
          child.getAttribute('href') ??
          '';
        const noteId = href.startsWith('#') ? href.slice(1) : href;
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

// Collect all <p>/<v>/<empty-line> descendants of el, skipping <annotation>, <title>, and nested <section> subtrees.
function collectParagraphs(el: Element, out: BookParagraph[]): void {
  for (const child of el.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'p' || tag === 'v') {
      const paragraph = parseParagraphElement(child);
      if (paragraph.length > 0) out.push(paragraph);
    } else if (tag === 'empty-line') {
      out.push({ type: ParagraphType.EmptyLine });
    } else if (tag !== 'annotation' && tag !== 'title' && tag !== 'section') {
      collectParagraphs(child, out);
    }
  }
}

// Collect <p>/<v>/<empty-line> from a section's direct non-title, non-section, non-annotation children.
function collectDirectParagraphs(section: Element): BookParagraph[] {
  const out: BookParagraph[] = [];
  for (const child of section.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'title' || tag === 'section' || tag === 'annotation') continue;
    if (tag === 'p' || tag === 'v') {
      const paragraph = parseParagraphElement(child);
      if (paragraph.length > 0) out.push(paragraph);
    } else if (tag === 'empty-line') {
      out.push({ type: ParagraphType.EmptyLine });
    } else {
      // poem, epigraph, cite, etc. — grab all p/v/empty-line descendants
      child.querySelectorAll('p, v, empty-line').forEach((el) => {
        if (el.tagName.toLowerCase() === 'empty-line') {
          out.push({ type: ParagraphType.EmptyLine });
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

  return { title, author, lang, sections, notes };
}
