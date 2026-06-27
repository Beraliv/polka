export type Page = string[];

const CHARS_PER_PAGE = 1500;

export function paginate(paragraphs: string[]): Page[] {
  const pages: Page[] = [];
  let current: string[] = [];
  let count = 0;

  for (const p of paragraphs) {
    if (count + p.length > CHARS_PER_PAGE && current.length > 0) {
      pages.push(current);
      current = [p];
      count = p.length;
    } else {
      current.push(p);
      count += p.length;
    }
  }

  if (current.length > 0) pages.push(current);
  return pages;
}
