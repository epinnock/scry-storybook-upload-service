import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { app, type AppEnv } from './app.js';

import type { StorageService } from './services/storage/storage.service.js';
import type { FirestoreService } from './services/firestore/firestore.service.js';

function createTestServer(options: {
  storage: StorageService;
  firestore?: FirestoreService;
}) {
  const wrapper = new Hono<AppEnv>();
  wrapper.use('*', async (c, next) => {
    c.set('storage', options.storage);
    if (options.firestore) c.set('firestore', options.firestore);
    await next();
  });
  wrapper.route('/', app);
  return wrapper;
}

describe('app routes (coverage)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /health returns ok + timestamp', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const res = await server.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(body.timestamp).toContain('T');
  });

  it('GET /upload/:project/:version returns file info', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const res = await server.request('/upload/my-proj/v1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.key).toBe('my-proj/v1/storybook.zip');
  });

  it('DELETE /cleanup/:project/:version requires X-Test-Cleanup=true', async () => {
    const deleteByPrefix = vi.fn(async () => undefined);
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: deleteByPrefix as any,
    };
    const server = createTestServer({ storage });

    const res1 = await server.request('/cleanup/my-proj/v1', { method: 'DELETE' });
    expect(res1.status).toBe(401);

    const res2 = await server.request('/cleanup/my-proj/v1', {
      method: 'DELETE',
      headers: { 'X-Test-Cleanup': 'true' },
    });
    expect(res2.status).toBe(200);
    expect(deleteByPrefix).toHaveBeenCalledWith('my-proj/v1/');
  });

  it('POST /upload/:project/:version enforces Content-Length max size', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const res = await server.request('/upload/my-proj/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'content-length': String(6 * 1024 * 1024),
      },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain('File too large');
  });

  it('POST /upload/:project/:version raw binary returns 400 on empty body', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const res = await server.request('/upload/my-proj/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array([]),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No file data received');
  });

  it('POST /upload/:project/:version multipart returns 400 when file is missing', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const form = new FormData();
    form.set('coverageJson', JSON.stringify({ ok: true }));

    const res = await server.request('/upload/my-proj/v1', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    // Depending on runtime parsing, this may fail early with a specific message,
    // or fall back to busboy and return a generic parse error.
    expect(String(body.error)).toMatch(
      /^(No file provided or empty file|Failed to parse file upload\.)/
    );
  });

  it('POST /upload/:project/:version multipart returns 400 for invalid coverageJson', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'storybook.zip', { type: 'application/zip' }));
    form.set('coverageJson', '{not-json');

    const res = await server.request('/upload/my-proj/v1', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid coverage JSON');
  });

  it('POST /upload/:project/:version does not fail when Firestore createBuild throws', async () => {
    const uploadMock = vi.fn(async (key: string) => ({ url: `https://storage.test/${key}`, path: key }));
    const storage: StorageService = {
      upload: uploadMock as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };

    const firestore: FirestoreService = {
      createBuild: vi.fn(async () => {
        throw new Error('firestore down');
      }) as any,
      getBuild: vi.fn() as any,
      getProjectBuilds: vi.fn() as any,
      getBuildByVersion: vi.fn() as any,
      getLatestBuild: vi.fn() as any,
      updateBuild: vi.fn() as any,
      updateBuildCoverage: vi.fn() as any,
      archiveBuild: vi.fn() as any,
      deleteBuild: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore });

    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'storybook.zip', { type: 'application/zip' }));

    const res = await server.request('/upload/my-proj/v1', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    // build data is optional when Firestore fails
    expect(body.data.buildId).toBeUndefined();
    expect(uploadMock).toHaveBeenCalledWith('my-proj/v1/storybook.zip', expect.anything(), 'application/zip');
  });

  it('POST /presigned-url/:project/:version/:filename uses default contentType if JSON body is invalid and creates build for .zip', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn(async (key: string, contentType: string) => {
        return { url: `https://signed.example/${key}?sig=1`, key, contentType } as any;
      }) as any,
      deleteByPrefix: vi.fn() as any,
    };

    const createBuildMock = vi.fn(async (_projectId: string, data: any) => ({
      id: 'build-1',
      projectId: 'my-proj',
      versionId: data.versionId,
      buildNumber: 1,
      zipUrl: data.zipUrl,
      status: 'active',
      createdAt: new Date(),
      createdBy: 'test',
    }));

    const firestore: FirestoreService = {
      createBuild: createBuildMock as any,
      getBuild: vi.fn() as any,
      getProjectBuilds: vi.fn() as any,
      getBuildByVersion: vi.fn() as any,
      getLatestBuild: vi.fn() as any,
      updateBuild: vi.fn() as any,
      updateBuildCoverage: vi.fn() as any,
      archiveBuild: vi.fn() as any,
      deleteBuild: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore });

    const res = await server.request('/presigned-url/my-proj/v1/storybook.zip', {
      method: 'POST',
      // Use a non-JSON content-type so the OpenAPI request validator doesn't
      // reject the request before it reaches the handler.
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-json',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields.key).toBe('my-proj/v1/storybook.zip');
    expect(body.buildId).toBe('build-1');
    expect(body.buildNumber).toBe(1);

    // zipUrl should strip query params
    const buildData = (createBuildMock.mock.calls[0] as any)[1];
    expect(buildData.zipUrl).toBe('https://signed.example/my-proj/v1/storybook.zip');

    // default contentType used when body is invalid
    expect((storage.getPresignedUploadUrl as any).mock.calls[0][1]).toBe('application/octet-stream');
  });

  it('POST /presigned-url/:project/:version/:filename does not create build for non-zip', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn(async (key: string) => ({ url: `https://signed.example/${key}?sig=1`, key })) as any,
      deleteByPrefix: vi.fn() as any,
    };

    const firestore: FirestoreService = {
      createBuild: vi.fn() as any,
      getBuild: vi.fn() as any,
      getProjectBuilds: vi.fn() as any,
      getBuildByVersion: vi.fn() as any,
      getLatestBuild: vi.fn() as any,
      updateBuild: vi.fn() as any,
      updateBuildCoverage: vi.fn() as any,
      archiveBuild: vi.fn() as any,
      deleteBuild: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore });

    const res = await server.request('/presigned-url/my-proj/v1/readme.txt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'text/plain' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields.key).toBe('my-proj/v1/readme.txt');
    expect(body.buildId).toBeUndefined();
    expect(body.buildNumber).toBeUndefined();
    expect(firestore.createBuild).not.toHaveBeenCalled();
  });

  it('POST /upload/:project/:version/coverage returns 500 if Firestore is not configured', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };
    const server = createTestServer({ storage });

    const res = await server.request('/upload/my-proj/v1/coverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(500);
  });

  it('POST /upload/:project/:version/coverage returns 404 when build is not found', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };

    const firestore: FirestoreService = {
      createBuild: vi.fn() as any,
      getBuild: vi.fn() as any,
      getProjectBuilds: vi.fn() as any,
      getBuildByVersion: vi.fn(async () => null) as any,
      getLatestBuild: vi.fn() as any,
      updateBuild: vi.fn() as any,
      updateBuildCoverage: vi.fn() as any,
      archiveBuild: vi.fn() as any,
      deleteBuild: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore });

    const res = await server.request('/upload/my-proj/v1/coverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('POST /upload/:project/:version/coverage returns 400 on invalid JSON body', async () => {
    const storage: StorageService = {
      upload: vi.fn() as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };

    const firestore: FirestoreService = {
      createBuild: vi.fn() as any,
      getBuild: vi.fn() as any,
      getProjectBuilds: vi.fn() as any,
      getBuildByVersion: vi.fn(async () => ({ id: 'b1' })) as any,
      getLatestBuild: vi.fn() as any,
      updateBuild: vi.fn() as any,
      updateBuildCoverage: vi.fn() as any,
      archiveBuild: vi.fn() as any,
      deleteBuild: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore });

    const res = await server.request('/upload/my-proj/v1/coverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('POST /upload/:project/:version/coverage accepts multipart form-data', async () => {
    const uploadMock = vi.fn(async (key: string) => ({ url: `https://storage.test/${key}`, path: key }));
    const storage: StorageService = {
      upload: uploadMock as any,
      getPresignedUploadUrl: vi.fn() as any,
      deleteByPrefix: vi.fn() as any,
    };

    const firestore: FirestoreService = {
      createBuild: vi.fn() as any,
      getBuild: vi.fn() as any,
      getProjectBuilds: vi.fn() as any,
      getBuildByVersion: vi.fn(async () => ({ id: 'build-1' })) as any,
      getLatestBuild: vi.fn() as any,
      updateBuild: vi.fn() as any,
      updateBuildCoverage: vi.fn(async () => undefined) as any,
      archiveBuild: vi.fn() as any,
      deleteBuild: vi.fn() as any,
    };

    const server = createTestServer({ storage, firestore });

    const payload = {
      summary: {
        componentCoverage: 0.9,
        propCoverage: 0.8,
        variantCoverage: 0.7,
        passRate: 0.95,
        totalComponents: 10,
        componentsWithStories: 9,
        failingStories: 1,
      },
      qualityGate: { passed: true, checks: [] },
      generatedAt: '2026-01-01T00:00:00.000Z',
    };

    const form = new FormData();
    form.set('file', new File([JSON.stringify(payload)], 'coverage.json', { type: 'application/json' }));

    const res = await server.request('/upload/my-proj/v1/coverage', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(201);
    expect(uploadMock).toHaveBeenCalledWith(
      'my-proj/v1/coverage-report.json',
      expect.anything(),
      'application/json'
    );
  });
});
