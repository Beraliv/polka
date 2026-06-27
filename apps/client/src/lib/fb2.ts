export type ParsedBook = {
  title: string;
  author?: string;
  paragraphs: string[];
};

export function parseFB2(buffer: ArrayBuffer): ParsedBook {
  const xml = new TextDecoder('utf-8').decode(buffer);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const titleEl = doc.querySelector('book-title') ?? doc.querySelector('title > p');
  const title = titleEl?.textContent?.trim() ?? 'Unknown title';

  const firstNameEl = doc.querySelector('first-name');
  const lastNameEl = doc.querySelector('last-name');
  const author =
    [firstNameEl?.textContent, lastNameEl?.textContent].filter(Boolean).join(' ') || undefined;

  // Collect all <p> elements inside <body>, skip section titles rendered as <title>
  const bodyEls = doc.querySelectorAll('FictionBook > body');
  const paragraphs: string[] = [];

  bodyEls.forEach((body) => {
    body.querySelectorAll('p').forEach((p) => {
      const text = p.textContent?.trim();
      if (text) paragraphs.push(text);
    });
    body.querySelectorAll('v').forEach((v) => {
      const text = v.textContent?.trim();
      if (text) paragraphs.push(text);
    });
  });

  return { title, author, paragraphs };
}
