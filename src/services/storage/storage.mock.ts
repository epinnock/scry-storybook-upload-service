import { StorageService, UploadResult } from './storage.service.js';

/**
 * A mock StorageService implementation for testing that returns
 * predictable URLs and responses that match test expectations.
 */
export class MockStorageService implements StorageService {
  private readonly baseUrl: string;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = options?.baseUrl || 'https://test-bucket.s3.amazonaws.com';
  }

  async upload(key: string, body: ReadableStream | Buffer, contentType: string): Promise<UploadResult> {
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return {
      url: `${this.baseUrl}/${key}`,
      path: key,
      versionId: `test-version-${Date.now()}`,
    };
  }

  async getPresignedUploadUrl(key: string, contentType: string): Promise<{ url: string; key: string }> {
    // Return a URL that contains s3.amazonaws.com to match test expectations
    const presignedUrl = `https://test-bucket.s3.amazonaws.com/${key}?AWSAccessKeyId=test&Expires=1234567890&Signature=test`;
    
    return { 
      url: presignedUrl, 
      key: key 
    };
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    // Mock implementation - in real tests this would track what was "deleted"
    console.log(`Mock: Deleting objects with prefix: ${prefix}`);
  }
}
