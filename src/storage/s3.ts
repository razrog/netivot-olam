import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StoredFile, ByteRange } from './types.js';

// S3-compatible storage — works for AWS S3 and Cloudflare R2 (R2 just uses a
// custom endpoint and region "auto"). This is the recommended backend: the
// browser streams audio directly via short-lived presigned URLs, so audio bytes
// never pass through the app server.

export interface S3Options {
  name: string; // 's3' or 'r2'
  bucket: string;
  region: string;
  endpoint?: string; // required for R2, optional for AWS
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  signTtl: number; // default expiry for signed URLs (seconds)
}

export class S3CompatibleProvider implements StorageProvider {
  readonly name: string;
  private client: S3Client;

  constructor(private opts: S3Options) {
    this.name = opts.name;
    if (!opts.bucket || !opts.accessKeyId || !opts.secretAccessKey) {
      throw new Error(`${opts.name} storage needs bucket + credentials — see .env.`);
    }
    this.client = new S3Client({
      region: opts.region || 'auto',
      endpoint: opts.endpoint || undefined,
      forcePathStyle: opts.forcePathStyle ?? false,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async listFiles(): Promise<StoredFile[]> {
    const files: StoredFile[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.opts.bucket, ContinuationToken: token })
      );
      for (const o of res.Contents ?? []) {
        if (!o.Key || !o.Key.toLowerCase().endsWith('.mp3')) continue;
        files.push({
          key: o.Key,
          name: o.Key.split('/').pop() ?? o.Key,
          size: o.Size,
          modifiedAt: o.LastModified?.toISOString(),
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return files;
  }

  async stat(key: string): Promise<{ size: number; contentType: string }> {
    const h = await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    return { size: Number(h.ContentLength ?? 0), contentType: h.ContentType ?? 'audio/mpeg' };
  }

  async open(key: string, range?: ByteRange): Promise<NodeJS.ReadableStream> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      })
    );
    return res.Body as unknown as NodeJS.ReadableStream;
  }

  // Short-lived URL the browser plays directly from the bucket.
  async getSignedUrl(key: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }),
      { expiresIn: expiresSeconds || this.opts.signTtl }
    );
  }
}
