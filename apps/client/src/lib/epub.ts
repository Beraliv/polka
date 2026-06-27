import { unzipSync } from 'fflate';

export type ParsedBook = {
  title: string;
  author?: string;
  paragraphs: string[];
};

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function extractParagraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result: string[] = [];
  doc.querySelectorAll('p, li').forEach((el) => {
    const text = el.textContent?.trim();
    if (text) result.push(text);
  });
  return result;
}

export function parseEPUB(buffer: ArrayBuffer): ParsedBook {
  const files = unzipSync(new Uint8Array(buffer));

  // Find the OPF file path from META-INF/container.xml
  const containerXml = files['META-INF/container.xml'];
  if (!containerXml) throw new Error('Not a valid EPUB: missing META-INF/container.xml');

  const containerDoc = new DOMParser().parseFromString(decode(containerXml), 'application/xml');
  const rootfilePath = containerDoc
    .querySelector('rootfile')
    ?.getAttribute('full-path');
  if (!rootfilePath) throw new Error('Cannot find rootfile in container.xml');

  // Parse the OPF
  const opfBytes = files[rootfilePath];
  if (!opfBytes) throw new Error(`OPF file not found: ${rootfilePath}`);
  const opfDoc = new DOMParser().parseFromString(decode(opfBytes), 'application/xml');

  // Metadata
  const title = opfDoc.querySelector('metadata > *|title, title')?.textContent?.trim() ?? 'Unknown title';
  const creatorEl = opfDoc.querySelector('metadata > *|creator, creator');
  const author = creatorEl?.textContent?.trim() || undefined;

  // Build id→href manifest map
  const opfDir = rootfilePath.includes('/') ? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, string>();
  opfDoc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, opfDir + href);
  });

  // Spine items in order
  const spineItems: string[] = [];
  opfDoc.querySelectorAll('spine > itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref');
    if (idref) {
      const href = manifest.get(idref);
      if (href) spineItems.push(href);
    }
  });

  // Extract paragraphs from each spine item
  const paragraphs: string[] = [];
  for (const href of spineItems) {
    const bytes = files[href];
    if (!bytes) continue;
    const html = decode(bytes);
    paragraphs.push(...extractParagraphs(html));
  }

  return { title, author, paragraphs };
}
