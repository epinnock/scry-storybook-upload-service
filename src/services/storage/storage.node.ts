// In src/services/storage/storage.node.ts

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { StorageService, UploadResult } from './storage.service.js';
import { Readable } from 'stream';

// Define the shape of the configuration object.
type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

/**
 * A StorageService implementation that uses the AWS S3 SDK v3
 * to communicate with Cloudflare R2's S3-compatible API.
 */
export class R2S3StorageService implements StorageService {
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly publicUrlBase: string;

  constructor(config: R2Config) {
    this.s3 = new S3Client({
      region: 'auto', // This is a required value for R2.
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucketName = config.bucketName;
    // This assumes a public bucket or a custom domain is configured for serving assets.
    this.publicUrlBase = `https://pub-${config.bucketName}.${config.accountId}.r2.dev`;
  }

  /**
   * Uploads a file to R2 using the S3 SDK. It handles both Buffers and ReadableStreams.
   */
  async upload(key: string, body: Buffer | ReadableStream, contentType: string): Promise<UploadResult> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });

    const result = await upload.done();

    return {
      url: `${this.publicUrlBase}/${key}`,
      path: key,
      versionId: result.VersionId,
    };
  }

  /**
   * Generates a presigned URL for direct client-side uploads.
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

  /**
   * Deletes all objects with keys matching the given prefix.
   * @param prefix The prefix to match object keys (e.g., 'project/version/').
   * @returns A promise that resolves when deletion is complete.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResult = await this.s3.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        const deleteParams = {
          Bucket: this.bucketName,
          Delete: {
            Objects: listResult.Contents.map(obj => ({ Key: obj.Key })),
            Quiet: true,
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await this.s3.send(deleteCommand);
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);
  }
}
