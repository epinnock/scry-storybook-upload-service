import { describe, expect, it, vi } from 'vitest';

// Exercise the options builder without starting Sentry's workerd-only wrapper.
vi.mock('@sentry/cloudflare', () => ({ withSentry: (_options: unknown, handler: unknown) => handler }));

const { sentryOptions } = await import('./entry.worker.js');
type Env = Parameters<typeof sentryOptions>[0];
const opts = (env: Partial<Env>) => sentryOptions(env as Env);

describe('Sentry options (observability-request-id)', () => {
  it.each([
    ['staging', 'staging'],
    ['production', 'production'],
  ])('SCRY_ENV=%s reports environment %s', (tier, expected) => {
    expect(opts({ SCRY_ENV: tier } as Partial<Env>).environment).toBe(expected);
  });

  it('never falls back to production: unset → unknown', () => {
    expect(opts({}).environment).toBe('unknown');
    expect(opts({ NODE_ENV: 'development' } as Partial<Env>).environment).toBe('unknown');
  });

  it('SENTRY_ENVIRONMENT still overrides for local runs', () => {
    expect(opts({ SENTRY_ENVIRONMENT: 'development', SCRY_ENV: 'production' } as Partial<Env>).environment).toBe('development');
  });

  it('debug is off on every tier, PII and bodies stay off', () => {
    for (const env of [{}, { SCRY_ENV: 'staging' }, { SCRY_ENV: 'production' }, { NODE_ENV: 'development' }]) {
      const o = opts(env as Partial<Env>);
      expect(o.debug).toBe(false);
      expect(o.sendDefaultPii).toBe(false);
      expect(o.dataCollection).toEqual({ userInfo: false, httpBodies: [] });
    }
  });
});
