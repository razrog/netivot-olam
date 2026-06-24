// The storage abstraction. This is the ONLY interface the rest of the app
// knows about — the indexer lists files through it, the API streams through
// it. Swapping Google Drive for S3 (or anything else) means writing one new
// class that implements this interface and changing a config value. No other
// code changes.

export interface StoredFile {
  key: string; // unique id within the provider (a path, a Drive file id, an S3 key…)
  name: string; // file name — the indexer parses metadata from this
  size?: number;
  modifiedAt?: string;
}

export interface ByteRange {
  start: number;
  end: number; // inclusive
}

export interface StorageProvider {
  readonly name: string;

  // List all audio files available to index.
  listFiles(): Promise<StoredFile[]>;

  // Size + content type, used to answer HTTP range requests for the player.
  stat(key: string): Promise<{ size: number; contentType: string }>;

  // A readable stream of the file (optionally a byte range, for seeking).
  // Used by the indexer (duration) and as the proxy-streaming fallback.
  open(key: string, range?: ByteRange): Promise<NodeJS.ReadableStream>;

  // Preferred streaming path: a short-lived URL the browser can play directly,
  // so audio bytes never pass through the app server. Backends that can't
  // produce one (local folder, Google Drive) return null and the API falls
  // back to proxy streaming via open().
  getSignedUrl(key: string, expiresSeconds: number): Promise<string | null>;
}
