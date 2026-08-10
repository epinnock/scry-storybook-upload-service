import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/cloudflare', () => ({ getTraceData: vi.fn() }));

import * as Sentry from '@sentry/cloudflare';
import { currentTraceContext } from './trace-context.js';

/**
 * Cloudflare Queues carry nothing but the message body, so a trace that starts
 * when a deploy is uploaded ends at `queue.send()` unless the context travels
 * inside the message. Without it, indexing shows up in Sentry as an unrelated
 * fragment rather than part of the deploy that caused it.
 */
describe('currentTraceContext', () => {
  const getTraceData = Sentry.getTraceData as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('captures the active trace for the message body', () => {
    getTraceData.mockReturnValue({
      'sentry-trace': 'abc123def456-0011223344556677-1',
      baggage: 'sentry-environment=production',
    });

    expect(currentTraceContext()).toEqual({
      sentryTrace: 'abc123def456-0011223344556677-1',
      baggage: 'sentry-environment=production',
    });
  });

  // Absent, not empty. `trace: {}` in a message body reads as "a trace was
  // attempted and lost", which is a different and more alarming thing than
  // tracing simply being off.
  it('returns undefined when there is no active trace', () => {
    getTraceData.mockReturnValue({});
    expect(currentTraceContext()).toBeUndefined();
  });

  it('returns undefined when Sentry returns nothing at all', () => {
    getTraceData.mockReturnValue(undefined);
    expect(currentTraceContext()).toBeUndefined();
  });

  // A deploy that uploaded successfully must still be queued even if telemetry
  // is broken. Enqueueing is the product; tracing is not.
  it('never throws when tracing is misconfigured', () => {
    getTraceData.mockImplementation(() => {
      throw new Error('Sentry not initialised');
    });

    expect(() => currentTraceContext()).not.toThrow();
    expect(currentTraceContext()).toBeUndefined();
  });

  it('tolerates a trace with no baggage', () => {
    getTraceData.mockReturnValue({ 'sentry-trace': 'abc-def-1' });
    expect(currentTraceContext()).toEqual({ sentryTrace: 'abc-def-1', baggage: undefined });
  });
});
