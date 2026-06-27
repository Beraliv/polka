export async function computeBookId(buffer: ArrayBuffer): Promise<string> {
  const slice = buffer.byteLength > 1024 ? buffer.slice(0, 1024) : buffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', slice);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
