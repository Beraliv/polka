// Rendered reader paragraphs; every position below points into one of them.
const PARAGRAPH_SELECTOR = '.reader-paragraph';
// A paragraph split across a page break renders its later part as a separate
// element marked with this class (see buildPages in ReaderPage.tsx).
const CONTINUATION_CLASS = 'no-indent';

/** A point in the text: an offset into one rendered paragraph's combined text. */
export type TextPosition = { paragraphEl: HTMLElement; offset: number };

type TextNodeMap = { nodes: Text[]; nodeStartOffsets: number[] };

/**
 * Walks every text node under `paragraphEl` (in document order) and returns
 * them alongside their combined-text offsets. Shared groundwork for
 * point-to-position hit-testing and position-to-Range — everything here
 * treats a rendered paragraph as one flat text run.
 */
function collectTextNodes(paragraphEl: HTMLElement): TextNodeMap {
  const walker = document.createTreeWalker(paragraphEl, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const nodeStartOffsets: number[] = [];
  let combinedLength = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    nodeStartOffsets.push(combinedLength);
    combinedLength += textNode.data.length;
    nodes.push(textNode);
  }
  return { nodes, nodeStartOffsets };
}

type LocatedOffset = { node: Text; offset: number };

function locatePosition(position: TextPosition): LocatedOffset | null {
  const map = collectTextNodes(position.paragraphEl);
  for (const [index, node] of map.nodes.entries()) {
    const start = map.nodeStartOffsets[index] ?? 0;
    if (position.offset <= start + node.data.length) {
      return { node, offset: position.offset - start };
    }
  }
  return null;
}

/** Builds a Range from `start` to `end`, which may be in different paragraphs. */
export function rangeBetween(start: TextPosition, end: TextPosition): Range | null {
  const startLocation = locatePosition(start);
  const endLocation = locatePosition(end);
  if (!startLocation || !endLocation) {
    return null;
  }
  const range = document.createRange();
  range.setStart(startLocation.node, startLocation.offset);
  range.setEnd(endLocation.node, endLocation.offset);
  return range;
}

/** Negative if `first` comes before `second` in reading order, 0 if equal, positive if after. */
export function comparePositions(first: TextPosition, second: TextPosition): number {
  if (first.paragraphEl === second.paragraphEl) {
    return first.offset - second.offset;
  }
  const relation = first.paragraphEl.compareDocumentPosition(second.paragraphEl);
  return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * Maps a viewport point to the text position under it, or null if the point
 * isn't over a reader paragraph's text. Uses whichever of
 * caretRangeFromPoint (WebKit/Blink) or caretPositionFromPoint (Firefox)
 * the browser supports.
 */
export function positionFromPoint(clientX: number, clientY: number): TextPosition | null {
  type LegacyDocument = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const doc = document as LegacyDocument;

  let node: Node | null = null;
  let offset = 0;
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (!range) {
      return null;
    }
    node = range.startContainer;
    offset = range.startOffset;
  } else if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(clientX, clientY);
    if (!position) {
      return null;
    }
    node = position.offsetNode;
    offset = position.offset;
  } else {
    return null;
  }

  // A caret between elements (e.g. in a paragraph margin) lands on an element
  // node rather than text; there's no character there to select.
  if (!(node instanceof Text)) {
    return null;
  }
  const paragraphEl = node.parentElement?.closest<HTMLElement>(PARAGRAPH_SELECTOR);
  if (!paragraphEl) {
    return null;
  }
  const map = collectTextNodes(paragraphEl);
  const nodeIndex = map.nodes.indexOf(node);
  return { paragraphEl, offset: (map.nodeStartOffsets[nodeIndex] ?? 0) + offset };
}

/** The rendered paragraphs from `start`'s to `end`'s, inclusive, in reading order. */
function paragraphsBetween(start: TextPosition, end: TextPosition): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR));
  const startIndex = all.indexOf(start.paragraphEl);
  const endIndex = all.indexOf(end.paragraphEl);
  if (startIndex === -1 || endIndex === -1) {
    return [];
  }
  return all.slice(startIndex, endIndex + 1);
}

/**
 * The selected text from `start` to `end`. Paragraphs are separated by a
 * newline, except a page-split continuation, which is joined with a space:
 * pagination splits on whitespace and drops it, and the two elements are one
 * paragraph of the book. (Range.toString() would join both with nothing.)
 */
export function textBetween(start: TextPosition, end: TextPosition): string {
  let text = '';
  for (const paragraphEl of paragraphsBetween(start, end)) {
    const paragraphText = paragraphEl.textContent ?? '';
    const sliceStart = paragraphEl === start.paragraphEl ? start.offset : 0;
    const sliceEnd = paragraphEl === end.paragraphEl ? end.offset : paragraphText.length;
    if (paragraphEl !== start.paragraphEl) {
      text += paragraphEl.classList.contains(CONTINUATION_CLASS) ? ' ' : '\n';
    }
    text += paragraphText.slice(sliceStart, sliceEnd);
  }
  return text;
}

/**
 * The line boxes covered by `range`'s text. Range.getClientRects() also
 * returns the box of every element fully inside the range — whole paragraphs
 * (margins, indents) and inline elements like <strong> on top of their own
 * text — which would paint as solid blocks and darker overlaps. Measuring
 * each text node's slice separately yields only the text itself.
 */
export function textRectsInRange(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer;
  if (root instanceof Text) {
    return Array.from(range.getClientRects());
  }
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    if (!range.intersectsNode(textNode)) {
      continue;
    }
    const sliceStart = textNode === range.startContainer ? range.startOffset : 0;
    const sliceEnd = textNode === range.endContainer ? range.endOffset : textNode.data.length;
    // A range starting at the very end of a text node still "intersects" it;
    // its empty slice would put a zero-width box (and the start handle) on
    // the previous line.
    if (sliceStart === sliceEnd) {
      continue;
    }
    const sliceRange = document.createRange();
    sliceRange.setStart(textNode, sliceStart);
    sliceRange.setEnd(textNode, sliceEnd);
    rects.push(...Array.from(sliceRange.getClientRects()));
  }
  return rects;
}

/** Expands `offset` to the bounds of the word it falls within. */
export function wordBoundsAtOffset(text: string, offset: number): [number, number] {
  const SegmenterCtor = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!SegmenterCtor) {
    return [offset, offset];
  }
  const segmenter = new SegmenterCtor(undefined, { granularity: 'word' });
  for (const segment of segmenter.segment(text)) {
    const start = segment.index;
    const end = start + segment.segment.length;
    if (offset >= start && offset < end) {
      return segment.isWordLike ? [start, end] : [offset, offset];
    }
  }
  return [offset, offset];
}
