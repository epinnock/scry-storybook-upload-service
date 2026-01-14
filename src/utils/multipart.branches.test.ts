import { describe, it, expect } from 'vitest';
import { parseMultipartFormData } from './multipart.js';

describe('parseMultipartFormData() (branch coverage)', () => {
  it('rejects if Content-Type is not multipart/form-data', async () => {
    const req = new Request('http://example.test/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    await expect(parseMultipartFormData(req)).rejects.toThrow('Content-Type must be multipart/form-data');
  });

  it('rejects if request has no body', async () => {
    // Request() with method POST but no body => request.body is null
    const req = new Request('http://example.test/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=abc' },
    });

    await expect(parseMultipartFormData(req)).rejects.toThrow('No request body');
  });

  // Note: We intentionally do not test low-level stream failure propagation here.
  // Busboy parsing depends on a valid multipart boundary/body; attempting to force
  // stream errors without valid multipart framing can lead to hanging tests.
});
