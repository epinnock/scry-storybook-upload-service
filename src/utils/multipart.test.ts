import { describe, it, expect } from 'vitest';
import { parseMultipartFormData } from './multipart.js';

describe('parseMultipartFormData()', () => {
  it('parses multiple file fields and text fields', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'storybook.zip', { type: 'application/zip' }));
    form.set(
      'coverage',
      new File([
        JSON.stringify({ hello: 'world' }),
      ], 'coverage-report.json', { type: 'application/json' })
    );
    form.set('coverageJson', JSON.stringify({ from: 'field' }));

    const req = new Request('http://example.test/upload', {
      method: 'POST',
      body: form,
    });

    const parsed = await parseMultipartFormData(req);

    expect(Object.keys(parsed.files)).toEqual(expect.arrayContaining(['file', 'coverage']));
    expect(parsed.files.file.name).toBe('storybook.zip');
    expect(parsed.files.coverage.name).toBe('coverage-report.json');
    expect(parsed.fields.coverageJson).toBe(JSON.stringify({ from: 'field' }));

    const coverageText = await parsed.files.coverage.text();
    expect(JSON.parse(coverageText)).toEqual({ hello: 'world' });
  });
});
