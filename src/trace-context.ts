import * as Sentry from '@sentry/cloudflare';

/**
 * Trace context to carry across the queue boundary.
 *
 * HTTP hops propagate this in headers automatically. Cloudflare Queues carry
 * nothing but the message body, so a trace that starts when a deploy is uploaded
 * ends at `queue.send()` unless the context travels inside the message. Without
 * it, indexing appears in Sentry as an unrelated fragment rather than part of
 * the deploy that caused it — and diagnosing a stalled build means
 * hand-correlating an upload log, a queue log and a Firestore document, which is
 * exactly what took hours when a credential was revoked.
 *
 * The consumer treats every field as optional and falls back to starting a fresh
 * trace, so messages enqueued before this shipped keep working.
 */
export interface QueueTraceContext {
  sentryTrace?: string;
  baggage?: string;
}

/**
 * Capture the active trace, or `undefined` when there is nothing to propagate.
 *
 * Returns `undefined` rather than an empty object so the field is simply absent
 * from the message when tracing is off — an empty `trace: {}` would suggest a
 * trace was attempted and lost, which is a different and more alarming thing to
 * read in a message body.
 */
export function currentTraceContext(): QueueTraceContext | undefined {
  try {
    const data = Sentry.getTraceData();
    const sentryTrace = data?.['sentry-trace'];
    if (!sentryTrace) return undefined;
    return { sentryTrace, baggage: data?.baggage };
  } catch {
    // Never let telemetry break an enqueue. A deploy that uploaded successfully
    // must still be queued even if tracing is misconfigured.
    return undefined;
  }
}
