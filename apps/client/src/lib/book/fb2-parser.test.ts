// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseFB2 } from './fb2-parser.ts';

// 1×1 transparent PNG, enough for cover-extraction assertions.
const COVER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

type BuildTestFb2Options = { coverpage?: string; binaries?: string };

function buildTestFb2({ coverpage, binaries }: BuildTestFb2Options = {}): ArrayBuffer {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <author><first-name>Test</first-name><last-name>Author</last-name></author>
      <book-title>Test Book</book-title>
      <lang>en</lang>
      ${coverpage ?? ''}
    </title-info>
  </description>
  <body>
    <section><title><p>Chapter 1</p></title><p>First paragraph.</p></section>
  </body>
  ${binaries ?? ''}
</FictionBook>`;
  return new TextEncoder().encode(xml).buffer as ArrayBuffer;
}

const COVER_BINARY = `<binary id="cover.png" content-type="image/png">${COVER_PNG_BASE64}</binary>`;

describe('parseFB2', () => {
  it('parses title, author and language metadata', () => {
    const parsed = parseFB2(buildTestFb2());
    expect(parsed.title).toBe('Test Book');
    expect(parsed.author).toBe('Test Author');
    expect(parsed.lang).toBe('en');
  });

  it('extracts the coverpage image as the cover', () => {
    const parsed = parseFB2(buildTestFb2({
      coverpage: '<coverpage><image l:href="#cover.png"/></coverpage>',
      binaries: COVER_BINARY,
    }));
    expect(parsed.coverImageId).toBe('cover.png');
    expect(parsed.images['cover.png']).toBe(`data:image/png;base64,${COVER_PNG_BASE64}`);
  });

  it('returns no cover when the coverpage references a missing binary', () => {
    const parsed = parseFB2(buildTestFb2({
      coverpage: '<coverpage><image l:href="#missing.png"/></coverpage>',
    }));
    expect(parsed.coverImageId).toBeUndefined();
  });

  it('returns no cover when the description has no coverpage', () => {
    const parsed = parseFB2(buildTestFb2({ binaries: COVER_BINARY }));
    expect(parsed.coverImageId).toBeUndefined();
  });
});
