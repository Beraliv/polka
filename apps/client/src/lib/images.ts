import type { BookImageAsset } from './paginate.ts';

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
