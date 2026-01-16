import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirestoreServiceWorker } from './firestore.worker.js';

function createSvc() {
  const svc = new FirestoreServiceWorker({
    projectId: 'firebase-proj',
    clientEmail: 'test@example.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\\nZm9v\\n-----END PRIVATE KEY-----',
    serviceAccountId: 'upload-service',
  });
  return svc;
}

describe('FirestoreServiceWorker (branch coverage)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('toFirestoreValue() covers null/undefined/boolean/date/number/string/array/object/fallback branches', () => {
    const svc = createSvc();

    expect((svc as any).toFirestoreValue(null)).toEqual({ nullValue: null });
    expect((svc as any).toFirestoreValue(undefined)).toEqual({ nullValue: null });
    expect((svc as any).toFirestoreValue(true)).toEqual({ booleanValue: true });

    const d = new Date('2026-01-01T00:00:00.000Z');
    expect((svc as any).toFirestoreValue(d)).toEqual({ timestampValue: d.toISOString() });

    expect((svc as any).toFirestoreValue('x')).toEqual({ stringValue: 'x' });
    expect((svc as any).toFirestoreValue(1)).toEqual({ integerValue: '1' });
    expect((svc as any).toFirestoreValue(1.5)).toEqual({ doubleValue: 1.5 });

    expect((svc as any).toFirestoreValue([1, 'a'])).toEqual({
      arrayValue: {
        values: [{ integerValue: '1' }, { stringValue: 'a' }],
      },
    });

    // object branch + skip undefined
    expect((svc as any).toFirestoreValue({ a: 1, b: undefined })).toEqual({
      mapValue: {
        fields: {
          a: { integerValue: '1' },
        },
      },
    });

    // fallback branch for unhandled types
    expect((svc as any).toFirestoreValue(1n)).toEqual({ stringValue: '1' });
  });

  it('fromFirestoreValue() covers all discriminator branches', () => {
    const svc = createSvc();

    expect((svc as any).fromFirestoreValue(undefined)).toBeUndefined();
    expect((svc as any).fromFirestoreValue({ nullValue: null })).toBeNull();
    expect((svc as any).fromFirestoreValue({ booleanValue: true })).toBe(true);
    expect((svc as any).fromFirestoreValue({ integerValue: '10' })).toBe(10);
    expect((svc as any).fromFirestoreValue({ doubleValue: 1.25 })).toBe(1.25);
    expect((svc as any).fromFirestoreValue({ stringValue: 's' })).toBe('s');
    expect((svc as any).fromFirestoreValue({ timestampValue: '2026-01-01T00:00:00.000Z' })).toBe(
      '2026-01-01T00:00:00.000Z'
    );

    expect(
      (svc as any).fromFirestoreValue({
        mapValue: {
          fields: {
            a: { integerValue: '1' },
            b: { stringValue: 'x' },
          },
        },
      })
    ).toEqual({ a: 1, b: 'x' });

    expect(
      (svc as any).fromFirestoreValue({
        arrayValue: {
          values: [{ stringValue: 'a' }, { integerValue: '2' }],
        },
      })
    ).toEqual(['a', 2]);

    // fallback branch
    expect((svc as any).fromFirestoreValue({ weird: 123 })).toEqual({ weird: 123 });
  });

  it('getAccessToken() covers cached + non-cached branches and error branch', async () => {
    const svc = createSvc();

    // cached branch
    (svc as any).accessToken = 'cached';
    (svc as any).tokenExpiry = Date.now() + 60_000;
    await expect((svc as any).getAccessToken()).resolves.toBe('cached');

    // non-cached success branch
    (svc as any).accessToken = null;
    (svc as any).tokenExpiry = 0;
    (svc as any).createJWT = vi.fn().mockResolvedValue('jwt');
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't1', expires_in: 3600 }) });
    await expect((svc as any).getAccessToken()).resolves.toBe('t1');
    expect((svc as any).accessToken).toBe('t1');

    // error branch
    (svc as any).accessToken = null;
    (svc as any).tokenExpiry = 0;
    (svc as any).createJWT = vi.fn().mockResolvedValue('jwt');
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, statusText: 'nope', text: async () => 'error body' });
    await expect((svc as any).getAccessToken()).rejects.toThrow('Failed to get access token');
  });
});

