import { describe, it, expect, vi } from 'vitest';
import { MockStorageService } from './storage.mock.js';

describe('MockStorageService', () => {
  it('upload() returns predictable url/path/versionId', async () => {
    const svc = new MockStorageService({ baseUrl: 'https://example.test' });
    const result = await svc.upload('a/b/c.txt', Buffer.from('x'), 'text/plain');
    expect(result.url).toBe('https://example.test/a/b/c.txt');
    expect(result.path).toBe('a/b/c.txt');
    expect(result.versionId).toMatch(/^test-version-/);
  });

  it('getPresignedUploadUrl() returns an s3.amazonaws.com URL (to match tests)', async () => {
    const svc = new MockStorageService({ baseUrl: 'https://example.test' });
    const { url, key } = await svc.getPresignedUploadUrl('k.zip', 'application/zip');
    expect(key).toBe('k.zip');
    expect(url).toContain('s3.amazonaws.com');
    expect(url).toContain('k.zip');
  });

  it('deleteByPrefix() logs the prefix', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const svc = new MockStorageService({ baseUrl: 'https://example.test' });
    await svc.deleteByPrefix('pfx/');
    expect(log).toHaveBeenCalledWith('Mock: Deleting objects with prefix: pfx/');
    log.mockRestore();
  });
});

