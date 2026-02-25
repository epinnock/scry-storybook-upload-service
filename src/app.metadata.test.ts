import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { app, type AppEnv } from './app.js';
import type { ApiKeyService } from './services/apikey/apikey.service.js';
import type { FirestoreService } from './services/firestore/firestore.service.js';
import type { StorageService } from './services/storage/storage.service.js';

function createTestServer(options: {
  storage: StorageService;
  firestore?: FirestoreService;
  queue?: { send: (payload: unknown) => Promise<void> };
  apiKeyService?: ApiKeyService;
}) {
  const wrapper = new Hono<AppEnv>();
  wrapper.use('*', async (c, next) => {
    c.set('storage', options.storage);
    if (options.firestore) c.set('firestore', options.firestore);
    if (options.queue) c.set('queue', options.queue as unknown as Queue);
    if (options.apiKeyService) c.set('apiKeyService', options.apiKeyService);
    await next();
  });
  wrapper.route('/', app);
  return wrapper;
}

function createFirestoreMock(overrides: Partial<FirestoreService> = {}): FirestoreService {
  return {
    createBuild: vi.fn() as any,
    getBuild: vi.fn() as any,
    getProjectBuilds: vi.fn() as any,
    getBuildByVersion: vi.fn() as any,
    getLatestBuild: vi.fn() as any,
    updateBuild: vi.fn() as any,
    updateBuildCoverage: vi.fn() as any,
    updateProcessingStatus: vi.fn() as any,
    archiveBuild: vi.fn() as any,
    deleteBuild: vi.fn() as any,
    ...overrides,
  };
}

describe('app metadata route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores metadata ZIP at build-specific R2 key and publishes queue message', async () => {
    const upload = vi.fn(async (key: string) => ({ url: `https://storage.test/${key}`, path: key }));
    const send = vi.fn(async () => undefined);
    const storage: StorageService = {
      upload: upload as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };

    const firestore = createFirestoreMock({
      getLatestBuild: vi.fn(async () => ({
        id: 'build-123',
        projectId: 'my-project',
        versionId: 'v1.0.0',
        buildNumber: 7,
        zipUrl: 'https://storage.test/my-project/v1.0.0/storybook.zip',
        status: 'active',
        createdAt: new Date(),
        createdBy: 'test',
      })) as any,
      updateProcessingStatus: vi.fn(async () => undefined) as any,
    });

    const server = createTestServer({
      storage,
      firestore,
      queue: { send },
    });

    const res = await server.request('/upload/my-project/v1.0.0/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array([80, 75, 3, 4]),
    });

    expect(res.status).toBe(201);
    expect(upload).toHaveBeenCalledWith(
      'my-project/v1.0.0/builds/7/metadata-screenshots.zip',
      expect.anything(),
      'application/zip'
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'my-project',
        versionId: 'v1.0.0',
        buildId: 'build-123',
        zipKey: 'my-project/v1.0.0/builds/7/metadata-screenshots.zip',
        timestamp: expect.any(Number),
      })
    );
    expect(firestore.updateProcessingStatus).toHaveBeenCalledWith('my-project', 'build-123', 'queued');

    const body = await res.json();
    expect(body.queued).toBe(true);
    expect(body.buildNumber).toBe(7);
  });

  it('returns 400 when metadata ZIP body is empty', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const firestore = createFirestoreMock();
    const server = createTestServer({ storage, firestore });

    const res = await server.request('/upload/my-project/v1.0.0/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array([]),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No file provided');
  });

  it('returns 400 when no build exists for project/version', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const firestore = createFirestoreMock({
      getLatestBuild: vi.fn(async () => null) as any,
    });
    const server = createTestServer({ storage, firestore });

    const res = await server.request('/upload/my-project/v1.0.0/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Upload storybook.zip first');
  });

  it('works without queue binding and returns queued=false', async () => {
    const upload = vi.fn(async (key: string) => ({ url: `https://storage.test/${key}`, path: key }));
    const storage: StorageService = {
      upload: upload as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const firestore = createFirestoreMock({
      getLatestBuild: vi.fn(async () => ({
        id: 'build-123',
        projectId: 'my-project',
        versionId: 'v1.0.0',
        buildNumber: 2,
        zipUrl: 'https://storage.test/my-project/v1.0.0/storybook.zip',
        status: 'active',
        createdAt: new Date(),
        createdBy: 'test',
      })) as any,
      updateProcessingStatus: vi.fn(async () => undefined) as any,
    });
    const server = createTestServer({ storage, firestore });

    const res = await server.request('/upload/my-project/v1.0.0/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.queued).toBe(false);
  });

  it('requires auth when API key service is configured', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const firestore = createFirestoreMock();
    const apiKeyService: ApiKeyService = {
      createApiKey: vi.fn() as any,
      validateApiKey: vi.fn() as any,
      listApiKeys: vi.fn() as any,
      revokeApiKey: vi.fn() as any,
      deleteApiKey: vi.fn() as any,
      updateLastUsed: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore, apiKeyService });
    const res = await server.request('/upload/my-project/v1.0.0/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(res.status).toBe(401);
  });
});
