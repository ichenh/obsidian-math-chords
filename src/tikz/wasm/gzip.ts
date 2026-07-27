export async function inflateGzipInto(
  compressed: Uint8Array,
  destination: Uint8Array,
): Promise<void> {
  const stream = new Blob([compressed.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > destination.byteLength) {
        throw new Error("Gzip output exceeds its expected size.");
      }
      destination.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== destination.byteLength) {
    throw new Error("Gzip output does not match its expected size.");
  }
}
