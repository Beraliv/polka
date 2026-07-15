import type { BookFormat } from '@polka/shared';
import { parseEPUB } from './epub-parser.ts';
import { parseFB2 } from './fb2-parser.ts';
import type { ParsedBook } from './types.ts';

type ParseBookOptions = {
  buffer: ArrayBuffer;
  format: BookFormat;
};

export function parseBook({ buffer, format }: ParseBookOptions): ParsedBook {
  return format === 'epub' ? parseEPUB(buffer) : parseFB2(buffer);
}
