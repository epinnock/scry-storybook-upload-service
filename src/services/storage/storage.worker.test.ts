// In src/services/storage/storage.worker.test.ts

import { describe, it, expect, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2S3StorageService } from './storage.worker';

// Mock the S3 dependencies
vi.mock('@aws-sdk/client-s3');
vi.mock('@aws-sdk/s3-request-presigner');

// Mock the R2Bucket
const mockR2Bucket = {
  put: vi.fn(),
};

describe('R2S3StorageService (Worker)', () => {
  const config = {
    accountId: 'test-account-id',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
    bucketName: 'test-bucket',
  };

  it('should upload a file using the R2 binding and return the correct result', async () => {
    // Arrange
    const storageService = new R2S3StorageService(mockR2Bucket as any, config);
    const mockR2Object = {
      key: 'test-project/test-version/storybook.zip',
      version: 'test-version-id',
    };
    mockR2Bucket.put.mockResolvedValue(mockR2Object);

    const key = 'test-project/test-version/storybook.zip';
    const body = new ReadableStream();
    const contentType = 'application/zip';

    // Act
    const result = await storageService.upload(key, body, contentType);

    // Assert
    expect(mockR2Bucket.put).toHaveBeenCalledWith(key, body, {
      httpMetadata: { contentType },
    });
    expect(result).toEqual({
      url: `https://pub-${config.bucketName}.${config.accountId}.r2.dev/${key}`,
      path: key,
      versionId: 'test-version-id',
    });
  });

  it('should generate a presigned URL and return it', async () => {
    // Arrange
    const storageService = new R2S3StorageService(mockR2Bucket as any, config);
    const mockSignedUrl = 'https://s3.presigned.url/for/upload';
    (getSignedUrl as vi.Mock).mockResolvedValue(mockSignedUrl);

    const key = 'test-project/test-version/storybook.zip';
    const contentType = 'application/zip';

    // Act
    const result = await storageService.getPresignedUploadUrl(key, contentType);

    // Assert
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(Object), // PutObjectCommand
      { expiresIn: 3600 }
    );
    expect(result).toEqual({
      url: mockSignedUrl,
      key: key,
    });
  });
});
