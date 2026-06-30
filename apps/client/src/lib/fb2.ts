import type { SectionItem } from './paginate.ts';

export type ParsedBook = {
  title: string;
  author?: string;
  sections: SectionItem[];
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

// Collect all <p>/<v> descendants of el, skipping <annotation>, <title>, and nested <section> subtrees.
function collectParagraphs(el: Element, out: string[]): void {
  for (const child of el.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'p' || tag === 'v') {
      const text = child.textContent?.trim();
      if (text) out.push(text);
    } else if (tag !== 'annotation' && tag !== 'title' && tag !== 'section') {
      collectParagraphs(child, out);
    }
  }
}

// Collect <p>/<v> from a section's direct non-title, non-section, non-annotation children.
function collectDirectParagraphs(section: Element): string[] {
  const out: string[] = [];
  for (const child of section.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'title' || tag === 'section' || tag === 'annotation') continue;
    if (tag === 'p' || tag === 'v') {
      const text = child.textContent?.trim();
      if (text) out.push(text);
    } else {
      // poem, epigraph, cite, etc. — grab all p/v descendants
      child.querySelectorAll('p, v').forEach((el) => {
        const text = el.textContent?.trim();
        if (text) out.push(text);
      });
    }
  }
  return out;
}

function childSections(el: Element): Element[] {
  return Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'section');
}

function collectSections(section: Element, level: number, out: SectionItem[]): void {
  if (level > 5) {
    return;
  }
  const title = getTitle(section);
  const paragraphs = collectDirectParagraphs(section);
  if (title || paragraphs.length > 0) {
    out.push({ level, title, paragraphs });
  }
  for (const child of childSections(section)) {
    collectSections(child, level + 1, out);
  }
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

  const sections: SectionItem[] = [];

  doc.querySelectorAll('FictionBook > body').forEach((body) => {
    if (body.getAttribute('name') === 'notes') return;

    const topSections = childSections(body);

    if (topSections.length === 0) {
      const paragraphs: string[] = [];
      collectParagraphs(body, paragraphs);
      if (paragraphs.length > 0) sections.push({ paragraphs });
      return;
    }

    for (const topSection of topSections) {
      collectSections(topSection, 1, sections);
    }
  });

  return { title, author, sections };
}
