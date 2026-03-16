import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirestoreServiceWorker } from './firestore.worker.js';

function createSvc() {
  const svc = new FirestoreServiceWorker({
    projectId: 'firebase-proj',
    clientEmail: 'test@example.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\\nZm9v\\n-----END PRIVATE KEY-----',
    serviceAccountId: 'upload-service',
  });

  // Bypass token generation logic.
  (svc as any).accessToken = 'test-token';
  (svc as any).tokenExpiry = Date.now() + 60_000;

  return svc;
}

describe('FirestoreServiceWorker — Upload CRUD', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createUpload() increments upload counter and writes the upload doc', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      // GET counter
      if (method === 'GET' && url.includes('/documents/projects/my-project/counters/uploads')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            fields: { currentUploadNumber: { integerValue: '3' } },
          }),
        } as any;
      }

      // PATCH counter (increment)
      if (method === 'PATCH' && url.includes('/documents/projects/my-project/counters/uploads')) {
        const body = JSON.parse(String(init?.body));
        expect(body.fields.currentUploadNumber.integerValue).toBe('4');
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      // PATCH upload document
      if (method === 'PATCH' && url.includes('/documents/projects/my-project/uploads/')) {
        const body = JSON.parse(String(init?.body));
        expect(body.fields.projectId.stringValue).toBe('my-project');
        expect(body.fields.uploadNumber.integerValue).toBe('4');
        expect(body.fields.status.stringValue).toBe('active');
        expect(body.fields.imageCount.integerValue).toBe('10');
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const svc = createSvc();
    const upload = await svc.createUpload('my-project', { imageCount: 10 });

    expect(upload.projectId).toBe('my-project');
    expect(upload.uploadNumber).toBe(4);
    expect(upload.status).toBe('active');
    expect(upload.imageCount).toBe(10);
    expect(upload.id).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3); // GET counter + PATCH counter + PATCH upload
  });

  it('createUpload() initializes counter when it does not exist', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      // GET counter — 404
      if (method === 'GET' && url.includes('/counters/uploads')) {
        return { ok: false, status: 404, json: async () => ({}) } as any;
      }

      // PATCH counter (init to 1)
      if (method === 'PATCH' && url.includes('/counters/uploads')) {
        const body = JSON.parse(String(init?.body));
        expect(body.fields.currentUploadNumber.integerValue).toBe('1');
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      // PATCH upload document
      if (method === 'PATCH' && url.includes('/documents/projects/my-project/uploads/')) {
        const body = JSON.parse(String(init?.body));
        expect(body.fields.uploadNumber.integerValue).toBe('1');
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const svc = createSvc();
    const upload = await svc.createUpload('my-project', { imageCount: 5 });
    expect(upload.uploadNumber).toBe(1);
  });

  it('getProjectUploads() returns list of uploads via runQuery', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      // runQuery uses POST to :runQuery endpoint
      if (method === 'POST' && url.includes('/projects/my-project:runQuery')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              document: {
                name: 'projects/firebase-proj/databases/(default)/documents/projects/my-project/uploads/u1',
                fields: {
                  projectId: { stringValue: 'my-project' },
                  uploadNumber: { integerValue: '1' },
                  status: { stringValue: 'completed' },
                  imageCount: { integerValue: '5' },
                  createdAt: { timestampValue: '2025-01-01T00:00:00.000Z' },
                },
              },
            },
          ]),
        } as any;
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const svc = createSvc();
    const uploads = await svc.getProjectUploads('my-project');

    expect(uploads).toHaveLength(1);
    expect(uploads[0].projectId).toBe('my-project');
    expect(uploads[0].uploadNumber).toBe(1);
    expect(uploads[0].status).toBe('completed');
  });

  it('updateUploadProcessingStatus() patches the upload doc', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      if (method === 'PATCH' && url.includes('/documents/projects/my-project/uploads/u1')) {
        const body = JSON.parse(String(init?.body));
        expect(body.fields.processingStatus.stringValue).toBe('completed');
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const svc = createSvc();
    await svc.updateUploadProcessingStatus('my-project', 'u1', 'completed' as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deleteUpload() sends DELETE request', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      if (method === 'DELETE' && url.includes('/documents/projects/my-project/uploads/u1')) {
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const svc = createSvc();
    await svc.deleteUpload('my-project', 'u1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
