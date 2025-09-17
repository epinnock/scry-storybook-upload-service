// In src/services/storage/storage.test.ts

import { describe, it, expect, vi } from 'vitest';
import { mock, instance, when, anything, anyString } from 'jest-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2S3StorageService } from './storage.node';
import { Readable } from 'stream';

// Mock the S3 dependencies
vi.mock('@aws-sdk/client-s3');
vi.mock('@aws-sdk/lib-storage');
vi.mock('@aws-sdk/s3-request-presigner');

describe('R2S3StorageService (Node.js)', () => {
  const config = {
    accountId: 'test-account-id',
    accessKeyId: 'test-access-key-id',
    secretAccessKey: 'test-secret-access-key',
    bucketName: 'test-bucket',
  };

  it('should upload a file and return the correct result', async () => {
    // Arrange
    const storageService = new R2S3StorageService(config);
    const mockUpload = {
      done: vi.fn().mockResolvedValue({ VersionId: 'test-version-id' }),
    };
    (Upload as vi.Mock).mockImplementation(() => mockUpload);

    const key = 'test-project/test-version/storybook.zip';
    const body = new Readable();
    const contentType = 'application/zip';

    // Act
    const result = await storageService.upload(key, body, contentType);

    // Assert
    expect(Upload).toHaveBeenCalledWith({
      client: expect.any(S3Client),
      params: {
        Bucket: config.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });
    expect(mockUpload.done).toHaveBeenCalled();
    expect(result).toEqual({
      url: `https://pub-${config.bucketName}.${config.accountId}.r2.dev/${key}`,
      path: key,
      versionId: 'test-version-id',
    });
  });

  it('should generate a presigned URL and return it', async () => {
    // Arrange
    const storageService = new R2S3StorageService(config);
    const mockSignedUrl = 'https://s3.presigned.url/for/upload';
    (getSignedUrl as vi.Mock).mockResolvedValue(mockSignedUrl);

    const key = 'test-project/test-version/storybook.zip';
    const contentType = 'application/zip';

    // Act
    const result = await storageService.getPresignedUploadUrl(key, contentType);

    // Assert
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(Object), // This will be a PutObjectCommand
      { expiresIn: 3600 }
    );
    expect(result).toEqual({
      url: mockSignedUrl,
      key: key,
    });
  });
});
