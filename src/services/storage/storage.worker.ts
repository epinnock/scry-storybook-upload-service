// In src/services/storage/storage.worker.ts

import { StorageService, UploadResult } from './storage.service';

/**
 * A StorageService implementation that uses a native Cloudflare R2 bucket binding.
 */
export class R2BindingStorageService implements StorageService {
  private readonly bucket: R2Bucket;

  /**
   * @param bucket The R2Bucket instance provided by the Cloudflare runtime.
   */
  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  /**
   * Uploads a file stream directly to the R2 bucket.
   */
  async upload(key: string, body: ReadableStream, contentType: string): Promise<UploadResult> {
    // The blueprint code for `upload` has a small issue. The body can be a Buffer, but R2's `put` method
    // with a stream expects a ReadableStream. The Node.js stream is not the same as the web stream.
    // However, in the context of a worker, the body will be a ReadableStream from the request.
    // The `upload` method signature accepts `ReadableStream | Buffer`.
    // The `R2Bucket.put` method accepts `ReadableStream | ArrayBuffer | string | Blob`.
    // I will assume the body is a ReadableStream as it comes from `c.req.body`.
    // The type signature from the interface is `ReadableStream | Buffer`. In the worker context,
    // we can assume it's a ReadableStream.
    const object = await this.bucket.put(key, body as ReadableStream, {
      httpMetadata: { contentType },
    });

    // In a production scenario, you would construct a URL based on a public R2 domain
    // or a custom domain mapped to the bucket.
    const publicUrl = `/r2-assets/${object.key}`;

    return {
      url: publicUrl,
      path: object.key,
      versionId: object.version,
    };
  }

  /**
   * This implementation for generating a presigned URL is a placeholder.
   * R2 bindings do not have a built-in method for creating S3-style presigned URLs.
   * A true implementation would require either making an authenticated API call to the
   * R2 S3 API from the Worker, or using a different upload strategy for this target.
   * For simplicity in this architecture, we assume direct uploads to the API endpoint.
   */
  async getPresignedUploadUrl(key: string, contentType: string): Promise<{ url: string; key: string }> {
    // NOTE: This is a significant architectural consideration.
    // Native R2 bindings do not support presigned URL generation.
    // The Node.js target (using the S3 API) is better suited for this pattern.
    // For Workers, direct POST/PUT uploads to the API endpoint are more common.
    console.warn('getPresignedUploadUrl is not natively supported via R2 bindings.');
    throw new Error('Method not implemented for R2 bindings.');
  }
}
