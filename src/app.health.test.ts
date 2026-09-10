import { describe, expect, it, vi } from 'vitest';
import { app } from './app.js';
import type { StampBindings } from './deploy-stamp.js';

const bindings: StampBindings = {
  SCRY_ENV: 'production',
  SCRY_COMMIT: '0123456789abcdef0123456789abcdef01234567',
  SCRY_BRANCH: 'main',
  SCRY_BUILD_TIME: '2026-09-10T12:00:00Z',
  SCRY_DEPLOY_ID: '12345',
  SCRY_ACTOR: 'deployer',
};

const stamp = {
  ok: true,
  service: 'storybook-deployment-service',
  env: 'production',
  commit: bindings.SCRY_COMMIT,
  branch: 'main',
  builtAt: bindings.SCRY_BUILD_TIME,
  deployId: '12345',
  actor: 'deployer',
};

describe.each(['/health', '/healthz'])('%s deployment stamp', (path) => {
  it('returns the full stamp without authentication or config leakage', async () => {
    const response = await app.request(path, {}, {
      ...bindings,
      SENTRY_DSN: 'private-dsn',
      R2_S3_SECRET_ACCESS_KEY: 'private-key',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    if (path === '/health') {
      expect(body.status).toBe('ok');
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      delete body.status;
      delete body.timestamp;
    }
    expect(body).toEqual(stamp);
  });

  it('uses local defaults when bindings are absent', async () => {
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      service: 'storybook-deployment-service',
      env: 'dev',
      commit: 'dev',
      branch: null,
      builtAt: null,
      deployId: null,
      actor: null,
    });
  });

  it('identifies the existing preview Worker as staging', async () => {
    const response = await app.request(path, {}, { ...bindings, SCRY_ENV: 'staging' });
    expect(await response.json()).toMatchObject({
      ...stamp,
      env: 'staging',
      service: 'storybook-deployment-service-preview',
    });
  });

  it('uses the overridden Worker name for a named deployment', async () => {
    const response = await app.request(path, {}, {
      ...bindings,
      SCRY_SERVICE: 'storybook-deployment-service-pr-42',
    });
    expect(await response.json()).toMatchObject({ service: 'storybook-deployment-service-pr-42' });
  });
});

// Exercise the real Worker middleware while avoiding the Cloudflare-only Sentry runtime.
vi.mock('@sentry/cloudflare', () => ({ withSentry: (_options: unknown, handler: unknown) => handler }));

describe('Worker health entry', () => {
  it.each(['/health', '/healthz'])('serves %s without storage or Firebase credentials', async (path) => {
    const { default: worker } = await import('./entry.worker.js');
    const response = await worker.fetch!(
      new Request(`http://127.0.0.1${path}`),
      bindings,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject(stamp);
  });
});
