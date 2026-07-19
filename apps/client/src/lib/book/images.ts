import type { BookImageAsset } from './types.ts';

async function decodeImageAsset(dataUrl: string): Promise<BookImageAsset | null> {
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    // Corrupt or unsupported binary data — the image is skipped during pagination.
    return null;
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}

/**
 * Cover thumbnails render in the 52×72 CSS px book-card box; 3× that height
 * keeps them crisp on high-density phone screens while staying a few KB each.
 */
const COVER_THUMBNAIL_MAX_HEIGHT_PX = 72 * 3;

/**
 * Downscales a cover image to a small JPEG thumbnail data URL, sized for the
 * book-card cover box. The thumbnail is persisted with the book list, so it
 * must stay small. Returns undefined when the image cannot be decoded.
 */
export async function createCoverThumbnail(coverDataUrl: string): Promise<string | undefined> {
  const image = new Image();
  image.src = coverDataUrl;
  try {
    await image.decode();
  } catch {
    // Corrupt or unsupported cover data — the card falls back to the format badge.
    return undefined;
  }
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return undefined;

  const scale = Math.min(1, COVER_THUMBNAIL_MAX_HEIGHT_PX / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Decodes book image data URLs to learn their intrinsic pixel sizes, so
 * pagination can compute display heights synchronously. Undecodable images
 * are dropped.
 */
export async function decodeImageAssets(
  dataUrls: Record<string, string>,
): Promise<Record<string, BookImageAsset>> {
  const assets: Record<string, BookImageAsset> = {};
  await Promise.all(
    Object.entries(dataUrls).map(async ([imageId, dataUrl]) => {
      const asset = await decodeImageAsset(dataUrl);
      if (asset) assets[imageId] = asset;
    }),
  );
  return assets;
}
