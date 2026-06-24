import fs from 'node:fs';
import path from 'node:path';
import type { StorageProvider, StoredFile, ByteRange } from './types.js';

// Reads audio from a local folder. Great for development and for self-hosting
// without any cloud account. `key` is just the file name within the folder.

export class LocalFolderProvider implements StorageProvider {
  readonly name = 'local';

  constructor(private readonly dir: string) {}

  async listFiles(): Promise<StoredFile[]> {
    const entries = await fs.promises.readdir(this.dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.mp3'))
      .map((e) => {
        const st = fs.statSync(path.join(this.dir, e.name));
        return { key: e.name, name: e.name, size: st.size, modifiedAt: st.mtime.toISOString() };
      });
  }

  async stat(key: string): Promise<{ size: number; contentType: string }> {
    const st = fs.statSync(this.resolveSafe(key));
    return { size: st.size, contentType: 'audio/mpeg' };
  }

  async open(key: string, range?: ByteRange): Promise<NodeJS.ReadableStream> {
    const file = this.resolveSafe(key);
    return range
      ? fs.createReadStream(file, { start: range.start, end: range.end })
      : fs.createReadStream(file);
  }

  // Local files have no external URL — stream through the app (proxy fallback).
  async getSignedUrl(): Promise<string | null> {
    return null;
  }

  // Resolve the key inside the media dir and refuse anything that escapes it.
  // Without this, a key like "../../etc/passwd" would be a path-traversal read.
  private resolveSafe(key: string): string {
    const base = path.resolve(this.dir);
    const full = path.resolve(base, key);
    if (full !== base && !full.startsWith(base + path.sep)) {
      throw new Error('Invalid storage key (path traversal blocked)');
    }
    return full;
  }
}
