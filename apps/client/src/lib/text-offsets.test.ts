// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { offsetFromPoint, rangeFromOffsets, wordBoundsAtOffset } from './text-offsets.ts';

function buildParagraphEl(innerHTML: string): HTMLElement {
  const el = document.createElement('p');
  el.innerHTML = innerHTML;
  document.body.appendChild(el);
  return el;
}

describe('rangeFromOffsets', () => {
  it('builds a Range spanning plain text and a styled run', () => {
    const paragraphEl = buildParagraphEl('The quick <em>brown</em> fox jumps.');
    const range = rangeFromOffsets(paragraphEl, 4, 15);
    expect(range?.toString()).toBe('quick brown');
  });

  it('returns null for an out-of-bounds offset', () => {
    const paragraphEl = buildParagraphEl('Short.');
    expect(rangeFromOffsets(paragraphEl, 0, 999)).toBeNull();
  });
});

describe('offsetFromPoint', () => {
  it('maps a point to a combined-text offset using caretRangeFromPoint', () => {
    const paragraphEl = buildParagraphEl('The quick <strong>brown fox</strong> jumps.');
    const strongText = paragraphEl.querySelector('strong')!.firstChild as Text;
    const stubbedRange = document.createRange();
    stubbedRange.setStart(strongText, 2);
    stubbedRange.setEnd(strongText, 2);
    (
      document as unknown as { caretRangeFromPoint: (x: number, y: number) => Range }
    ).caretRangeFromPoint = () => stubbedRange;

    const offset = offsetFromPoint(paragraphEl, 0, 0);
    // "The quick " (10 chars) + 2 chars into "brown fox"
    expect(offset).toBe(12);
  });

  it('returns null when the point resolves outside paragraphEl', () => {
    const paragraphEl = buildParagraphEl('Inside.');
    const outsideEl = document.createElement('p');
    outsideEl.textContent = 'Outside.';
    document.body.appendChild(outsideEl);
    const stubbedRange = document.createRange();
    stubbedRange.setStart(outsideEl.firstChild!, 0);
    stubbedRange.setEnd(outsideEl.firstChild!, 0);
    (
      document as unknown as { caretRangeFromPoint: (x: number, y: number) => Range }
    ).caretRangeFromPoint = () => stubbedRange;

    expect(offsetFromPoint(paragraphEl, 0, 0)).toBeNull();
  });
});

describe('wordBoundsAtOffset', () => {
  it('expands an offset within a word to the word bounds', () => {
    const text = 'The quick brown fox';
    // Offset 6 is inside "quick" (index 4-9).
    expect(wordBoundsAtOffset(text, 6)).toEqual([4, 9]);
  });

  it('returns a zero-width range for whitespace', () => {
    const text = 'The quick brown fox';
    // Offset 3 is the space right after "The".
    expect(wordBoundsAtOffset(text, 3)).toEqual([3, 3]);
  });
});
