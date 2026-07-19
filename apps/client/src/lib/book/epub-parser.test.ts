// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseEPUB } from './epub-parser.ts';
import { isNoteRef } from './types.ts';
import type { NoteRef, Paragraph, RichText } from './types.ts';

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const CONTENT_OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
    <itemref idref="notes"/>
    <itemref idref="toc" linear="no"/>
  </spine>
</package>`;

const CHAPTER1_XHTML = `<html xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Chapter 1</title></head>
<body>
  <h1>Chapter 1</h1>
  <p>Plain text with <em>italic words</em> and <strong>bold words</strong>.</p>
  <p>A claim with an inline footnote<a epub:type="noteref" href="#fn1">1</a> attached.</p>
  <aside epub:type="footnote" id="fn1"><p>Inline footnote body.</p></aside>
  <p>A claim with an endnote<a href="notes.xhtml#n1"><sup>[2]</sup></a> attached.</p>
  <p>See the <a href="chapter1.xhtml#fn1">next chapter</a> for details.</p>
  <blockquote><div>Verse line one<a href="notes.xhtml#n1"><sup>[2]</sup></a><br/>Verse line two</div></blockquote>
</body>
</html>`;

const NOTES_XHTML = `<html>
<head><title>Notes</title></head>
<body>
  <h1>Notes</h1>
  <div id="n1"><p>Endnote body.</p><p><a href="chapter1.xhtml">Вернуться</a></p></div>
</body>
</html>`;

const TOC_XHTML = `<html>
<head><title>Contents</title></head>
<body>
  <h1>Contents</h1>
  <p><a href="chapter1.xhtml">Chapter 1</a></p>
</body>
</html>`;

function buildTestEpub(): ArrayBuffer {
  const zipped = zipSync({
    'META-INF/container.xml': strToU8(CONTAINER_XML),
    'OEBPS/content.opf': strToU8(CONTENT_OPF),
    'OEBPS/chapter1.xhtml': strToU8(CHAPTER1_XHTML),
    'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
    'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
  });
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

// 1×1 transparent PNG, enough for cover-extraction assertions.
const COVER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function coverPngBytes(): Uint8Array {
  return Uint8Array.from(atob(COVER_PNG_BASE64), (character) => character.charCodeAt(0));
}

type BuildEpubWithCoverOptions = { manifestItem: string; metadataExtra?: string };

// Rebuilds the test EPUB with a cover.png plus the given manifest/metadata
// declarations, covering both the EPUB 3 and EPUB 2 cover conventions.
function buildEpubWithCover({ manifestItem, metadataExtra }: BuildEpubWithCoverOptions): ArrayBuffer {
  const opf = CONTENT_OPF
    .replace('</metadata>', `${metadataExtra ?? ''}</metadata>`)
    .replace('<manifest>', `<manifest>${manifestItem}`);
  const zipped = zipSync({
    'META-INF/container.xml': strToU8(CONTAINER_XML),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/chapter1.xhtml': strToU8(CHAPTER1_XHTML),
    'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
    'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
    'OEBPS/cover.png': coverPngBytes(),
  });
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

function contentParagraphs(parsed: ReturnType<typeof parseEPUB>): Paragraph[] {
  return parsed.sections.flatMap((section) =>
    section.paragraphs.filter((paragraph): paragraph is Paragraph => Array.isArray(paragraph)),
  );
}

function paragraphText(paragraph: Paragraph): string {
  const parts: string[] = [];
  for (const span of paragraph) {
    if (typeof span === 'string') {
      parts.push(span);
    } else if (isNoteRef(span)) {
      parts.push(span.label);
    } else {
      parts.push(span.text);
    }
  }
  return parts.join('');
}

function allNoteRefs(parsed: ReturnType<typeof parseEPUB>): NoteRef[] {
  return contentParagraphs(parsed).flatMap((paragraph) => paragraph.filter(isNoteRef));
}

describe('parseEPUB', () => {
  it('parses title and author from the OPF metadata', () => {
    const parsed = parseEPUB(buildTestEpub());
    expect(parsed.title).toBe('Test Book');
    expect(parsed.author).toBe('Test Author');
  });

  it('parses inline italic and bold runs', () => {
    const parsed = parseEPUB(buildTestEpub());
    const styled = contentParagraphs(parsed)
      .flat()
      .filter((span): span is RichText => typeof span === 'object' && 'style' in span);
    expect(styled).toContainEqual({ text: 'italic words', style: { italic: true } });
    expect(styled).toContainEqual({ text: 'bold words', style: { bold: true } });
  });

  it('turns epub:type="noteref" links into note references with popup content', () => {
    const parsed = parseEPUB(buildTestEpub());
    const noteRef = allNoteRefs(parsed).find((ref) => ref.label === '1');
    expect(noteRef).toBeDefined();
    expect(parsed.notes[noteRef!.noteId]).toEqual({ title: '1', text: 'Inline footnote body.' });
  });

  it('detects endnote-style links via heuristics and strips backlinks from the note text', () => {
    const parsed = parseEPUB(buildTestEpub());
    const noteRef = allNoteRefs(parsed).find((ref) => ref.label === '[2]');
    expect(noteRef).toBeDefined();
    expect(noteRef!.noteId).toBe('OEBPS/notes.xhtml#n1');
    expect(parsed.notes[noteRef!.noteId]).toEqual({ title: '2', text: 'Endnote body.' });
  });

  it('extracts bare-text blockquotes (verse) including their note references', () => {
    const parsed = parseEPUB(buildTestEpub());
    const verse = contentParagraphs(parsed).find((paragraph) =>
      paragraphText(paragraph).includes('Verse line one'),
    );
    expect(verse).toBeDefined();
    expect(paragraphText(verse!)).toContain('Verse line two');
    expect(verse!.filter(isNoteRef)).toHaveLength(1);
  });

  it('excludes linear="no" spine documents from the reading flow', () => {
    const parsed = parseEPUB(buildTestEpub());
    const titles = parsed.sections.map((section) => section.title);
    expect(titles).not.toContain('Contents');
  });

  it('keeps ordinary cross-reference links as plain text', () => {
    const parsed = parseEPUB(buildTestEpub());
    const crossReference = contentParagraphs(parsed).find((paragraph) =>
      paragraphText(paragraph).includes('next chapter'),
    );
    expect(crossReference).toBeDefined();
    expect(crossReference!.some((span) => isNoteRef(span))).toBe(false);
  });

  it('excludes note bodies and notes-only documents from the reading flow', () => {
    const parsed = parseEPUB(buildTestEpub());
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe('Chapter 1');
    const texts = contentParagraphs(parsed).map(paragraphText);
    expect(texts.join(' ')).not.toContain('Inline footnote body.');
    expect(texts.join(' ')).not.toContain('Endnote body.');
  });

  it('extracts the cover from an EPUB 3 properties="cover-image" manifest item', () => {
    const parsed = parseEPUB(buildEpubWithCover({
      manifestItem: '<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>',
    }));
    expect(parsed.coverImageId).toBe('cover-img');
    expect(parsed.images['cover-img']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
  });

  it('extracts the cover from an EPUB 2 meta name="cover" reference', () => {
    const parsed = parseEPUB(buildEpubWithCover({
      manifestItem: '<item id="cover-img" href="cover.png" media-type="image/png"/>',
      metadataExtra: '<meta name="cover" content="cover-img"/>',
    }));
    expect(parsed.coverImageId).toBe('cover-img');
    expect(parsed.images['cover-img']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
  });

  it('returns no cover when the OPF declares none', () => {
    const parsed = parseEPUB(buildTestEpub());
    expect(parsed.coverImageId).toBeUndefined();
    expect(parsed.images).toEqual({});
  });

  it('survives a malformed meta name="cover" reference instead of aborting the parse', () => {
    const parsed = parseEPUB(buildEpubWithCover({
      manifestItem: '<item id="cover-img" href="cover.png" media-type="image/png"/>',
      metadataExtra: '<meta name="cover" content="bad&quot;quote\\backslash"/>',
    }));
    expect(parsed.title).toBe('Test Book');
    expect(parsed.coverImageId).toBeUndefined();
  });
});
