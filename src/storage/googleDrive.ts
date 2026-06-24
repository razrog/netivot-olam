import { google, type drive_v3 } from 'googleapis';
import type { StorageProvider, StoredFile, ByteRange } from './types.js';

// Reads audio from a Google Drive folder using a service-account key.
// `key` is the Drive file id. Auth uses read-only scope (least privilege).
//
// To use: create a service account, download its JSON key, share the Drive
// folder with the service account's email, and set GDRIVE_FOLDER_ID +
// GOOGLE_APPLICATION_CREDENTIALS in .env.

export class GoogleDriveProvider implements StorageProvider {
  readonly name = 'gdrive';
  private client?: drive_v3.Drive;

  constructor(
    private readonly folderId: string,
    private readonly credentialsPath: string
  ) {
    if (!folderId || !credentialsPath) {
      throw new Error('Google Drive provider needs GDRIVE_FOLDER_ID and GOOGLE_APPLICATION_CREDENTIALS.');
    }
  }

  private async drive(): Promise<drive_v3.Drive> {
    if (this.client) return this.client;
    const auth = new google.auth.GoogleAuth({
      keyFile: this.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    this.client = google.drive({ version: 'v3', auth: await auth.getClient() as any });
    return this.client;
  }

  async listFiles(): Promise<StoredFile[]> {
    const drive = await this.drive();
    const files: StoredFile[] = [];
    let pageToken: string | undefined;
    do {
      // folderId comes from trusted config, not user input.
      const res = await drive.files.list({
        q: `'${this.folderId}' in parents and mimeType contains 'audio/' and trashed = false`,
        fields: 'nextPageToken, files(id, name, size, modifiedTime)',
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        files.push({
          key: f.id!,
          name: f.name!,
          size: f.size ? Number(f.size) : undefined,
          modifiedAt: f.modifiedTime ?? undefined,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return files;
  }

  async stat(key: string): Promise<{ size: number; contentType: string }> {
    const drive = await this.drive();
    const res = await drive.files.get({ fileId: key, fields: 'size, mimeType' });
    return {
      size: Number(res.data.size ?? 0),
      contentType: res.data.mimeType ?? 'audio/mpeg',
    };
  }

  async open(key: string, range?: ByteRange): Promise<NodeJS.ReadableStream> {
    const drive = await this.drive();
    const headers: Record<string, string> = {};
    if (range) headers.Range = `bytes=${range.start}-${range.end}`;
    const res = await drive.files.get(
      { fileId: key, alt: 'media' },
      { responseType: 'stream', headers }
    );
    return res.data as unknown as NodeJS.ReadableStream;
  }

  // Drive doesn't offer S3-style presigned URLs for authenticated files, so we
  // proxy-stream instead (returns null to trigger the fallback).
  async getSignedUrl(): Promise<string | null> {
    return null;
  }
}
