// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseEPUB } from './epub-parser.ts';
import { isImage, isNoteRef } from './types.ts';
import type { BookParagraph, NoteRef, Paragraph, RichText } from './types.ts';

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
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
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
function buildEpubWithCover({
  manifestItem,
  metadataExtra,
}: BuildEpubWithCoverOptions): ArrayBuffer {
  const opf = CONTENT_OPF.replace('</metadata>', `${metadataExtra ?? ''}</metadata>`).replace(
    '<manifest>',
    `<manifest>${manifestItem}`,
  );
  const zipped = zipSync({
    'META-INF/container.xml': strToU8(CONTAINER_XML),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/chapter1.xhtml': strToU8(CHAPTER1_XHTML),
    'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
    'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
    'OEBPS/cover.png': coverPngBytes(),
  });
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

// Three chapters with no <h1>/<h2>/<h3> at all — mirroring FB2-to-EPUB
// converters that mark titles with <div class="titleN"> instead of real
// headings — so any TOC entry these tests see can only have come from the
// nav/NCX document, not from extractSectionItem's heading heuristic.
const TOC_CHAPTER_A_XHTML = `<html>
<head><title>A</title></head>
<body><div class="title1"><p>Part One</p></div></body>
</html>`;

const TOC_CHAPTER_B_XHTML = `<html>
<head><title>B</title></head>
<body><div class="title2"><p>1</p></div><p>Body text one.</p></body>
</html>`;

const TOC_CHAPTER_C_XHTML = `<html>
<head><title>C</title></head>
<body><div class="title2"><p>2</p></div><p>Body text two.</p></body>
</html>`;

const TOC_TEST_FILES = {
  'OEBPS/chapterA.xhtml': strToU8(TOC_CHAPTER_A_XHTML),
  'OEBPS/chapterB.xhtml': strToU8(TOC_CHAPTER_B_XHTML),
  'OEBPS/chapterC.xhtml': strToU8(TOC_CHAPTER_C_XHTML),
};

function zipToBuffer(files: Record<string, Uint8Array>): ArrayBuffer {
  const zipped = zipSync(files);
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

// EPUB 2 NCX: navPoints nest to express TOC depth, "Part One" wrapping two
// chapter-level navPoints.
function buildEpubWithNcxToc(): ArrayBuffer {
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Toc Book</dc:title></metadata>
  <manifest>
    <item id="chapterA" href="chapterA.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapterB" href="chapterB.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapterC" href="chapterC.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapterA"/>
    <itemref idref="chapterB"/>
    <itemref idref="chapterC"/>
  </spine>
</package>`;
  const ncx = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<navMap>
<navPoint id="np1">
<navLabel><text>Part One</text></navLabel>
<content src="chapterA.xhtml"/>
<navPoint id="np2">
<navLabel><text>Chapter 1</text></navLabel>
<content src="chapterB.xhtml"/>
</navPoint>
<navPoint id="np3">
<navLabel><text>Chapter 2</text></navLabel>
<content src="chapterC.xhtml"/>
</navPoint>
</navPoint>
</navMap>
</ncx>`;
  return zipToBuffer({
    'META-INF/container.xml': strToU8(CONTAINER_XML),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/toc.ncx': strToU8(ncx),
    ...TOC_TEST_FILES,
  });
}

// EPUB 3 nav document: <ol>/<li>/<a> nesting expresses TOC depth instead.
function buildEpubWithNavToc(): ArrayBuffer {
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Toc Book</dc:title></metadata>
  <manifest>
    <item id="chapterA" href="chapterA.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapterB" href="chapterB.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapterC" href="chapterC.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="chapterA"/>
    <itemref idref="chapterB"/>
    <itemref idref="chapterC"/>
  </spine>
</package>`;
  const nav = `<html xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Nav</title></head>
<body>
<nav epub:type="toc">
<ol>
<li><a href="chapterA.xhtml">Part One</a>
<ol>
<li><a href="chapterB.xhtml">Chapter 1</a></li>
<li><a href="chapterC.xhtml">Chapter 2</a></li>
</ol>
</li>
</ol>
</nav>
</body>
</html>`;
  return zipToBuffer({
    'META-INF/container.xml': strToU8(CONTAINER_XML),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(nav),
    ...TOC_TEST_FILES,
  });
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

function allBookParagraphs(parsed: ReturnType<typeof parseEPUB>): BookParagraph[] {
  return parsed.sections.flatMap((section) => section.paragraphs);
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
    const parsed = parseEPUB(
      buildEpubWithCover({
        manifestItem:
          '<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>',
      }),
    );
    expect(parsed.coverImageId).toBe('cover-img');
    expect(parsed.images['cover-img']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
  });

  it('extracts the cover from an EPUB 2 meta name="cover" reference', () => {
    const parsed = parseEPUB(
      buildEpubWithCover({
        manifestItem: '<item id="cover-img" href="cover.png" media-type="image/png"/>',
        metadataExtra: '<meta name="cover" content="cover-img"/>',
      }),
    );
    expect(parsed.coverImageId).toBe('cover-img');
    expect(parsed.images['cover-img']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
  });

  it('returns no cover when the OPF declares none', () => {
    const parsed = parseEPUB(buildTestEpub());
    expect(parsed.coverImageId).toBeUndefined();
    expect(parsed.images).toEqual({});
  });

  it('survives a malformed meta name="cover" reference instead of aborting the parse', () => {
    const parsed = parseEPUB(
      buildEpubWithCover({
        manifestItem: '<item id="cover-img" href="cover.png" media-type="image/png"/>',
        metadataExtra: '<meta name="cover" content="bad&quot;quote\\backslash"/>',
      }),
    );
    expect(parsed.title).toBe('Test Book');
    expect(parsed.coverImageId).toBeUndefined();
  });

  it('parses a chapter whose <title/> is self-closed instead of empty', () => {
    // Some EPUB producers (e.g. FB2-to-EPUB converters) emit XML-style
    // self-closing empty elements. In HTML parsing mode <title/> isn't void,
    // so a naive parse swallows the rest of the document — including <body>
    // — as the title's text, leaving no content behind.
    const selfClosingTitleChapter = CHAPTER1_XHTML.replace('<title>Chapter 1</title>', '<title/>');
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER_XML),
      'OEBPS/content.opf': strToU8(CONTENT_OPF),
      'OEBPS/chapter1.xhtml': strToU8(selfClosingTitleChapter),
      'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
      'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
    });
    const buffer = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;

    const parsed = parseEPUB(buffer);
    expect(parsed.sections).toHaveLength(1);
    const texts = contentParagraphs(parsed).map(paragraphText);
    expect(texts.join(' ')).toContain('Plain text with');
  });

  it('builds the TOC from an EPUB 2 NCX when sections carry no heading', () => {
    const parsed = parseEPUB(buildEpubWithNcxToc());
    expect(parsed.sections.every((section) => section.title === undefined)).toBe(true);
    expect(parsed.toc).toEqual([
      { title: 'Part One', level: 1, sectionIndex: 0 },
      { title: 'Chapter 1', level: 2, sectionIndex: 1 },
      { title: 'Chapter 2', level: 2, sectionIndex: 2 },
    ]);
  });

  it('builds the TOC from an EPUB 3 nav document when sections carry no heading', () => {
    const parsed = parseEPUB(buildEpubWithNavToc());
    expect(parsed.sections.every((section) => section.title === undefined)).toBe(true);
    expect(parsed.toc).toEqual([
      { title: 'Part One', level: 1, sectionIndex: 0 },
      { title: 'Chapter 1', level: 2, sectionIndex: 1 },
      { title: 'Chapter 2', level: 2, sectionIndex: 2 },
    ]);
  });

  it('falls back to heading-derived TOC entries when there is no nav or NCX document', () => {
    const parsed = parseEPUB(buildTestEpub());
    expect(parsed.toc).toEqual([{ title: 'Chapter 1', level: 1, sectionIndex: 0 }]);
  });

  it("resolves percent-encoded manifest hrefs against the archive's literal (decoded) file names", () => {
    // Producers that emit non-ASCII file names (e.g. Adobe InDesign's EPUB
    // export) percent-encode hrefs per the URI spec, but the zip's own entry
    // names are the literal Unicode names — every content lookup silently
    // failed until hrefs were decoded before matching.
    const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Encoded Href Book</dc:title></metadata>
  <manifest>
    <item id="chapter1" href="%D0%93%D0%BB%D0%B0%D0%B2%D0%B0%20%26%201.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`;
    const chapter = `<html><head><title>Ch</title></head><body><h1>Глава</h1><p>Текст главы.</p></body></html>`;
    const buffer = zipToBuffer({
      'META-INF/container.xml': strToU8(CONTAINER_XML),
      'OEBPS/content.opf': strToU8(opf),
      'OEBPS/Глава & 1.xhtml': strToU8(chapter),
    });

    const parsed = parseEPUB(buffer);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe('Глава');
    const texts = contentParagraphs(parsed).map(paragraphText);
    expect(texts.join(' ')).toContain('Текст главы.');
  });

  it('extracts images inside a paragraph and standalone images not wrapped in a paragraph', () => {
    // Mirrors two real-world patterns: an <img> sharing a <p> with a caption
    // <span> (common in InDesign-exported EPUBs), and a bare <img> inside a
    // wrapper <div> with no surrounding <p> at all.
    const chapter = `<html><head><title>Ch</title></head>
<body>
  <h1>Chapter 1</h1>
  <p class="foto"><img src="image/1.png" alt=""/><span>Caption text</span></p>
  <div><img src="image/2.png" alt=""/></div>
  <p>Normal paragraph text.</p>
</body>
</html>`;
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER_XML),
      'OEBPS/content.opf': strToU8(CONTENT_OPF),
      'OEBPS/chapter1.xhtml': strToU8(chapter),
      'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
      'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
      'OEBPS/image/1.png': coverPngBytes(),
      'OEBPS/image/2.png': coverPngBytes(),
    });
    const buffer = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;

    const parsed = parseEPUB(buffer);
    const paragraphs = allBookParagraphs(parsed);
    expect(paragraphs.filter(isImage).map((image) => image.imageId)).toEqual([
      'OEBPS/image/1.png',
      'OEBPS/image/2.png',
    ]);
    expect(parsed.images['OEBPS/image/1.png']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
    expect(parsed.images['OEBPS/image/2.png']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
    const texts = contentParagraphs(parsed).map(paragraphText);
    expect(texts).toContain('Caption text');
    expect(texts).toContain('Normal paragraph text.');
  });

  it('excludes images inside note bodies from the reading flow', () => {
    const chapter = `<html xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Ch</title></head>
<body>
  <h1>Chapter 1</h1>
  <p>A claim with an inline footnote<a epub:type="noteref" href="#fn1">1</a> attached.</p>
  <aside epub:type="footnote" id="fn1"><img src="image/note.png" alt=""/><p>Inline footnote body.</p></aside>
</body>
</html>`;
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER_XML),
      'OEBPS/content.opf': strToU8(CONTENT_OPF),
      'OEBPS/chapter1.xhtml': strToU8(chapter),
      'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
      'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
      'OEBPS/image/note.png': coverPngBytes(),
    });
    const buffer = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;

    const parsed = parseEPUB(buffer);
    const paragraphs = allBookParagraphs(parsed);
    expect(paragraphs.filter(isImage)).toEqual([]);
    expect(parsed.images['OEBPS/image/note.png']).toBeUndefined();
  });

  it('records an image paragraph even when the referenced file is missing from the archive', () => {
    const chapter = `<html><head><title>Ch</title></head>
<body>
  <h1>Chapter 1</h1>
  <p><img src="image/missing.png" alt=""/></p>
</body>
</html>`;
    const zipped = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER_XML),
      'OEBPS/content.opf': strToU8(CONTENT_OPF),
      'OEBPS/chapter1.xhtml': strToU8(chapter),
      'OEBPS/notes.xhtml': strToU8(NOTES_XHTML),
      'OEBPS/toc.xhtml': strToU8(TOC_XHTML),
    });
    const buffer = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength,
    ) as ArrayBuffer;

    const parsed = parseEPUB(buffer);
    const paragraphs = allBookParagraphs(parsed);
    expect(paragraphs.filter(isImage).map((image) => image.imageId)).toEqual([
      'OEBPS/image/missing.png',
    ]);
    expect(parsed.images['OEBPS/image/missing.png']).toBeUndefined();
  });
});
