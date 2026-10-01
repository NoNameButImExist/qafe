import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../config/config.js';

export const STORAGE = Symbol('STORAGE');

/** Public file storage (menu images, logos). */
export interface Storage {
  /** Stores the file and returns the URL browsers load it from. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

/** S3-compatible storage (MinIO locally). The bucket allows anonymous reads. */
class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(private readonly config: Extract<StorageConfig, { driver: 's3' }>) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys contain a random UUID and never change, so browsers may cache them for good.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.config.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/** Keeps files in memory; for tests. */
export class MemoryStorage implements Storage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<string> {
    this.files.set(key, { body, contentType });
    return Promise.resolve(`memory://${key}`);
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

export function createStorage(config: StorageConfig): Storage {
  return config.driver === 's3' ? new S3Storage(config) : new MemoryStorage();
}
