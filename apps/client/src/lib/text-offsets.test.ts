// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  comparePositions,
  positionFromPoint,
  rangeBetween,
  textBetween,
  textRectsInRange,
  wordBoundsAtOffset,
} from './text-offsets.ts';

type CaretDocument = Document & { caretRangeFromPoint?: (x: number, y: number) => Range };

function buildParagraphEl(innerHTML: string, className = 'reader-paragraph'): HTMLElement {
  const paragraphEl = document.createElement('p');
  paragraphEl.className = className;
  paragraphEl.innerHTML = innerHTML;
  document.body.appendChild(paragraphEl);
  return paragraphEl;
}

function stubCaretAt({ node, offset }: { node: Node; offset: number }) {
  const caretRange = document.createRange();
  caretRange.setStart(node, offset);
  (document as CaretDocument).caretRangeFromPoint = () => caretRange;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rangeBetween', () => {
  it('spans plain text and a styled run within one paragraph', () => {
    const paragraphEl = buildParagraphEl('The quick <em>brown</em> fox jumps.');
    const range = rangeBetween({ paragraphEl, offset: 4 }, { paragraphEl, offset: 15 });
    expect(range?.toString()).toBe('quick brown');
  });

  it('spans from one paragraph into the next', () => {
    const firstEl = buildParagraphEl('First paragraph.');
    const secondEl = buildParagraphEl('Second paragraph.');
    const range = rangeBetween(
      { paragraphEl: firstEl, offset: 6 },
      { paragraphEl: secondEl, offset: 6 },
    );
    expect(range?.toString()).toBe('paragraph.Second');
  });

  it('returns null for an out-of-bounds offset', () => {
    const paragraphEl = buildParagraphEl('Short.');
    expect(rangeBetween({ paragraphEl, offset: 0 }, { paragraphEl, offset: 999 })).toBeNull();
  });
});

describe('comparePositions', () => {
  it('orders by offset within a paragraph and by document order across paragraphs', () => {
    const firstEl = buildParagraphEl('First.');
    const secondEl = buildParagraphEl('Second.');
    expect(
      comparePositions({ paragraphEl: firstEl, offset: 1 }, { paragraphEl: firstEl, offset: 3 }),
    ).toBeLessThan(0);
    expect(
      comparePositions({ paragraphEl: firstEl, offset: 3 }, { paragraphEl: firstEl, offset: 3 }),
    ).toBe(0);
    expect(
      comparePositions({ paragraphEl: secondEl, offset: 0 }, { paragraphEl: firstEl, offset: 5 }),
    ).toBeGreaterThan(0);
  });
});

describe('textBetween', () => {
  it('separates paragraphs with a newline', () => {
    const firstEl = buildParagraphEl('First paragraph.');
    const middleEl = buildParagraphEl('Middle.');
    const lastEl = buildParagraphEl('Last paragraph.');
    expect(
      textBetween({ paragraphEl: firstEl, offset: 6 }, { paragraphEl: lastEl, offset: 4 }),
    ).toBe(`paragraph.\n${middleEl.textContent}\nLast`);
  });

  it('joins a page-split continuation with a space', () => {
    const firstEl = buildParagraphEl('The paragraph continues');
    const continuationEl = buildParagraphEl('on the next page.', 'reader-paragraph no-indent');
    expect(
      textBetween({ paragraphEl: firstEl, offset: 4 }, { paragraphEl: continuationEl, offset: 6 }),
    ).toBe('paragraph continues on the');
  });
});

describe('positionFromPoint', () => {
  it('maps a point to a paragraph and combined-text offset', () => {
    const paragraphEl = buildParagraphEl('The quick <strong>brown fox</strong> jumps.');
    stubCaretAt({ node: paragraphEl.querySelector('strong')!.firstChild!, offset: 2 });
    // "The quick " (10 chars) + 2 chars into "brown fox"
    expect(positionFromPoint(0, 0)).toEqual({ paragraphEl, offset: 12 });
  });

  it('returns null outside reader paragraphs', () => {
    const otherEl = buildParagraphEl('Not book text.', 'something-else');
    stubCaretAt({ node: otherEl.firstChild!, offset: 0 });
    expect(positionFromPoint(0, 0)).toBeNull();
  });

  it('returns null when the caret lands between elements rather than in text', () => {
    const paragraphEl = buildParagraphEl('Text.');
    stubCaretAt({ node: paragraphEl, offset: 0 });
    expect(positionFromPoint(0, 0)).toBeNull();
  });
});

describe('textRectsInRange', () => {
  it('measures text nodes only, not the boxes of elements inside the range', () => {
    const firstEl = buildParagraphEl('One <em>two</em>');
    const secondEl = buildParagraphEl('three');
    const range = rangeBetween(
      { paragraphEl: firstEl, offset: 0 },
      { paragraphEl: secondEl, offset: 5 },
    )!;
    const measured: string[] = [];
    // jsdom has no layout; record which text each measured range covers.
    Range.prototype.getClientRects = function (this: Range) {
      measured.push(this.toString());
      return [new DOMRect(0, 0, 1, 1)] as unknown as DOMRectList;
    };

    expect(textRectsInRange(range)).toHaveLength(3);
    expect(measured).toEqual(['One ', 'two', 'three']);
  });
});

describe('wordBoundsAtOffset', () => {
  it('expands an offset within a word to the word bounds', () => {
    // Offset 6 is inside "quick" (index 4-9).
    expect(wordBoundsAtOffset('The quick brown fox', 6)).toEqual([4, 9]);
  });

  it('returns a zero-width range for whitespace', () => {
    // Offset 3 is the space right after "The".
    expect(wordBoundsAtOffset('The quick brown fox', 3)).toEqual([3, 3]);
  });
});
