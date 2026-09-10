import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serve } from '@hono/node-server';

vi.mock('@hono/node-server', () => ({ serve: vi.fn() }));
vi.mock('dotenv/config', () => ({}));

describe('Node health entry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(serve).mockClear();
    vi.stubEnv('NODE_ENV', 'test');
    for (const name of [
      'SCRY_ENV', 'SCRY_SERVICE', 'SCRY_COMMIT', 'SCRY_BRANCH', 'SCRY_BUILD_TIME',
      'SCRY_DEPLOY_ID', 'SCRY_ACTOR', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_PROJECT_ID',
    ]) vi.stubEnv(name, undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(['/health', '/healthz'])('passes the process stamp through to %s', async (path) => {
    vi.stubEnv('SCRY_ENV', 'production');
    vi.stubEnv('SCRY_COMMIT', '0123456789abcdef0123456789abcdef01234567');
    vi.stubEnv('SCRY_BRANCH', 'main');
    vi.stubEnv('SCRY_BUILD_TIME', '2026-09-10T12:00:00Z');
    vi.stubEnv('SCRY_DEPLOY_ID', '12345');
    vi.stubEnv('SCRY_ACTOR', 'deployer');
    await import('./entry.node.js');
    const { fetch } = vi.mocked(serve).mock.calls[0][0];
    const response = await fetch(new Request(`http://127.0.0.1${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      service: 'storybook-deployment-service',
      env: 'production',
      commit: '0123456789abcdef0123456789abcdef01234567',
      branch: 'main',
      builtAt: '2026-09-10T12:00:00Z',
      deployId: '12345',
      actor: 'deployer',
    });
  });

  it('defaults to dev with absent process stamp variables', async () => {
    await import('./entry.node.js');
    const { fetch } = vi.mocked(serve).mock.calls[0][0];
    const response = await fetch(new Request('http://127.0.0.1/healthz'));
    expect(await response.json()).toEqual({
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
});
