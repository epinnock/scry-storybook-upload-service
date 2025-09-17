// In src/services/storage/storage.worker.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService, UploadResult } from './storage.service';

// Define the shape of the configuration object, similar to the Node.js version.
type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

/**
 * A StorageService implementation for Cloudflare Workers that uses a hybrid approach:
 * - Native R2 bindings for efficient uploads initiated by the Worker.
 * - The S3 SDK for generating presigned URLs for client-side uploads.
 */
export class R2S3StorageService implements StorageService {
  private readonly bucket: R2Bucket;
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly publicUrlBase: string;

  /**
   * @param bucket The R2Bucket instance provided by the Cloudflare runtime.
   * @param config The R2 S3-compatible API configuration.
   */
  constructor(bucket: R2Bucket, config: R2Config) {
    this.bucket = bucket;
    this.bucketName = config.bucketName;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    // This assumes a public bucket or a custom domain is configured.
    this.publicUrlBase = `https://pub-${config.bucketName}.${config.accountId}.r2.dev`;
  }

  /**
   * Uploads a file stream directly to the R2 bucket using the native binding.
   * This is efficient for uploads that are proxied through the Worker.
   */
  async upload(key: string, body: ReadableStream, contentType: string): Promise<UploadResult> {
    const object = await this.bucket.put(key, body, {
      httpMetadata: { contentType },
    });

    return {
      url: `${this.publicUrlBase}/${object.key}`,
      path: object.key,
      versionId: object.version,
    };
  }

  /**
   * Generates a presigned URL using the S3 API, allowing a client to upload directly to R2.
   */
  async getPresignedUploadUrl(key: string, contentType: string): Promise<{ url: string; key: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 }); // URL valid for 1 hour

    return { url: signedUrl, key: key };
  }
}
