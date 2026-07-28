import type { TikzRenderArtifact } from "./types";

const STORE_NAME = "artifacts";
const META_STORE_NAME = "artifact-metadata";
const DATABASE_VERSION = 3;

interface PersistentCacheRecord {
  key: string;
  bytes: ArrayBuffer;
  exportPdfBytes?: ArrayBuffer;
  mediaType: TikzRenderArtifact["mediaType"];
  backend: TikzRenderArtifact["backend"];
  durationMs: number;
  log?: string;
  size: number;
  accessedAt: number;
}

interface PersistentCacheMetadata {
  key: string;
  size: number;
  accessedAt: number;
}

export interface TikzPersistentCache {
  get(key: string): Promise<TikzRenderArtifact | undefined>;
  set(key: string, artifact: TikzRenderArtifact): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

export class IndexedDbTikzCache implements TikzPersistentCache {
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  constructor(
    namespace: string,
    private readonly maxEntries = 96,
    private readonly maxBytes = 32 * 1024 * 1024,
  ) {
    this.databaseName = `math-chords-tikz-${namespace}-v3`;
  }

  private readonly databaseName: string;

  async get(key: string): Promise<TikzRenderArtifact | undefined> {
    const database = await this.open();
    if (!database) return undefined;

    return new Promise((resolve) => {
      let artifact: TikzRenderArtifact | undefined;
      const transaction = database.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key) as IDBRequest<
        PersistentCacheRecord | undefined
      >;
      request.onsuccess = () => {
        const record = request.result;
        if (!record) return;
        if (
          !(record.bytes instanceof ArrayBuffer) ||
          (
            record.exportPdfBytes !== undefined &&
            !(record.exportPdfBytes instanceof ArrayBuffer)
          ) ||
          record.bytes.byteLength +
              (record.exportPdfBytes?.byteLength ?? 0) !==
            record.size ||
          record.size <= 0 ||
          record.size > this.maxBytes
        ) {
          store.delete(key);
          transaction.objectStore(META_STORE_NAME).delete(key);
          return;
        }
        record.accessedAt = Date.now();
        store.put(record);
        transaction.objectStore(META_STORE_NAME).put({
          key,
          size: record.size,
          accessedAt: record.accessedAt,
        } satisfies PersistentCacheMetadata);
        artifact = {
          bytes: new Uint8Array(record.bytes),
          exportPdfBytes: record.exportPdfBytes
            ? new Uint8Array(record.exportPdfBytes)
            : undefined,
          mediaType: record.mediaType,
          backend: record.backend,
          durationMs: record.durationMs,
          log: record.log,
        };
      };
      transaction.oncomplete = () => resolve(artifact);
      transaction.onerror = () => resolve(undefined);
      transaction.onabort = () => resolve(undefined);
    });
  }

  async set(key: string, artifact: TikzRenderArtifact): Promise<void> {
    const size =
      artifact.bytes.byteLength +
      (artifact.exportPdfBytes?.byteLength ?? 0);
    if (size > this.maxBytes) return;
    const database = await this.open();
    if (!database) return;

    const accessedAt = Date.now();
    const record: PersistentCacheRecord = {
      key,
      bytes: artifact.bytes.slice().buffer,
      exportPdfBytes: artifact.exportPdfBytes?.slice().buffer,
      mediaType: artifact.mediaType,
      backend: artifact.backend,
      durationMs: artifact.durationMs,
      log: artifact.log,
      size,
      accessedAt,
    };
    await this.writeRecord(database, record, {
      key,
      size: record.size,
      accessedAt,
    });
    await this.prune(database);
  }

  async clear(): Promise<void> {
    const database = await this.open();
    if (!database) return;
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(META_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  close(): void {
    void this.databasePromise?.then((database) => database?.close());
    this.databasePromise = null;
  }

  private open(): Promise<IDBDatabase | null> {
    this.databasePromise ??= new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = (event) => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        } else if (event.oldVersion < DATABASE_VERSION) {
          // Render caches are disposable. Clearing the v1 store avoids keeping
          // unindexed entries that would require loading every artifact body
          // into memory just to enforce cache limits.
          request.transaction?.objectStore(STORE_NAME).clear();
        }
        if (!request.result.objectStoreNames.contains(META_STORE_NAME)) {
          request.result.createObjectStore(META_STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.databasePromise;
  }

  private writeRecord(
    database: IDBDatabase,
    record: PersistentCacheRecord,
    metadata: PersistentCacheMetadata,
  ): Promise<void> {
    return new Promise((resolve) => {
      const transaction = database.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      transaction.objectStore(STORE_NAME).put(record);
      transaction.objectStore(META_STORE_NAME).put(metadata);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  private async prune(database: IDBDatabase): Promise<void> {
    const records = await new Promise<PersistentCacheMetadata[]>((resolve) => {
      const transaction = database.transaction(META_STORE_NAME, "readonly");
      const request = transaction
        .objectStore(META_STORE_NAME)
        .getAll() as IDBRequest<
        PersistentCacheMetadata[]
      >;
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
    records.sort((left, right) => right.accessedAt - left.accessedAt);
    let totalBytes = 0;
    const expiredKeys: string[] = [];
    for (const [index, record] of records.entries()) {
      totalBytes += record.size;
      if (index >= this.maxEntries || totalBytes > this.maxBytes) {
        expiredKeys.push(record.key);
      }
    }
    if (expiredKeys.length === 0) return;
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(
        [STORE_NAME, META_STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(STORE_NAME);
      const metadata = transaction.objectStore(META_STORE_NAME);
      for (const key of expiredKeys) {
        store.delete(key);
        metadata.delete(key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }
}
