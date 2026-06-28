export function computeBookId(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer.byteLength > 1024 ? buffer.slice(0, 1024) : buffer);
  // FNV-1a 32-bit — no Web Crypto API needed, works over plain HTTP
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash ^ bytes[i]) * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
