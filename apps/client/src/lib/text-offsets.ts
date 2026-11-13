type TextNodeMap = { nodes: Text[]; nodeStartOffsets: number[] };

/**
 * Walks every text node under `paragraphEl` (in document order) and returns
 * them alongside their combined-text offsets. Shared groundwork for
 * point-to-offset hit-testing and offset-to-Range — everything here treats a
 * rendered paragraph as one flat text run.
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

function locateOffset(map: TextNodeMap, offset: number): LocatedOffset | null {
  for (const [index, node] of map.nodes.entries()) {
    const start = map.nodeStartOffsets[index] ?? 0;
    if (offset <= start + node.data.length) {
      return { node, offset: offset - start };
    }
  }
  return null;
}

/** Builds a Range over [startOffset, endOffset) of paragraphEl's combined text. */
export function rangeFromOffsets(
  paragraphEl: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const map = collectTextNodes(paragraphEl);
  const start = locateOffset(map, startOffset);
  const end = locateOffset(map, endOffset);
  if (!start || !end) {
    return null;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/**
 * Maps a viewport point to a combined-text offset within paragraphEl, or
 * null if the point doesn't land inside it. Uses whichever of
 * caretRangeFromPoint (WebKit/Blink) or caretPositionFromPoint (Firefox)
 * the browser supports.
 */
export function offsetFromPoint(
  paragraphEl: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
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

  if (!paragraphEl.contains(node)) {
    return null;
  }

  const map = collectTextNodes(paragraphEl);
  const nodeIndex = map.nodes.indexOf(node as Text);
  if (nodeIndex === -1) {
    return null;
  }
  return (map.nodeStartOffsets[nodeIndex] ?? 0) + offset;
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
