import type { TikzRenderArtifact } from "./types";

interface CacheEntry {
  artifact: TikzRenderArtifact;
  size: number;
}

export class TikzRenderCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(
    private readonly maxEntries = 24,
    private readonly maxBytes = 16 * 1024 * 1024,
  ) {}

  get(key: string): TikzRenderArtifact | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.artifact;
  }

  set(key: string, artifact: TikzRenderArtifact): void {
    const previous = this.entries.get(key);
    if (previous) {
      this.totalBytes -= previous.size;
      this.entries.delete(key);
    }

    const size = artifact.bytes.byteLength;
    if (size > this.maxBytes) return;

    this.entries.set(key, { artifact, size });
    this.totalBytes += size;
    this.evict();
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  getStats(): { entries: number; bytes: number } {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
    };
  }

  private evict(): void {
    while (
      this.entries.size > this.maxEntries ||
      this.totalBytes > this.maxBytes
    ) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) return;
      this.entries.delete(oldest[0]);
      this.totalBytes -= oldest[1].size;
    }
  }
}
