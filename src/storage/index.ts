import { config } from '../config.js';
import { LocalFolderProvider } from './local.js';
import { GoogleDriveProvider } from './googleDrive.js';
import { S3CompatibleProvider } from './s3.js';
import type { StorageProvider } from './types.js';

// Factory: pick the backend from config. This is the single switch point for
// changing where audio lives. Recommended production backend is R2/S3, which
// streams directly to the browser via signed URLs.
function createStorage(): StorageProvider {
  switch (config.storageProvider) {
    case 'r2':
    case 's3':
      return new S3CompatibleProvider({
        name: config.storageProvider,
        bucket: config.s3.bucket,
        region: config.s3.region,
        endpoint: config.s3.endpoint,
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
        forcePathStyle: config.s3.forcePathStyle,
        signTtl: config.signedUrlTtl,
      });
    case 'gdrive':
      return new GoogleDriveProvider(config.gdrive.folderId, config.gdrive.credentialsPath);
    case 'local':
    default:
      return new LocalFolderProvider(config.local.mediaDir);
  }
}

export const storage: StorageProvider = createStorage();
export type { StorageProvider } from './types.js';
