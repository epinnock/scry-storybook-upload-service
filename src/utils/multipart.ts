import busboy from 'busboy';
import { Readable } from 'stream';

/**
 * Parse multipart/form-data from a Fetch API Request using busboy.
 *
 * This is primarily used as a Node.js compatibility fallback when `request.formData()` fails.
 * It supports multiple file fields (e.g. storybook `file` + optional `coverage`).
 */
export async function parseMultipartFormData(
  request: Request
): Promise<{ files: Record<string, File>; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('multipart/form-data')) {
      reject(new Error('Content-Type must be multipart/form-data'));
      return;
    }

    const files: Record<string, File> = {};
    const fields: Record<string, string> = {};

    const bb = busboy({ headers: { 'content-type': contentType } });

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];

      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        files[name] = new File([buffer], filename || name || 'upload', {
          type: mimeType || 'application/octet-stream',
        });
      });
    });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('finish', () => {
      resolve({ files, fields });
    });

    bb.on('error', (err) => {
      reject(err);
    });

    // Convert the request body to a readable stream
    if (request.body) {
      const reader = request.body.getReader();
      const stream = new Readable({
        read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                this.push(null);
              } else {
                this.push(Buffer.from(value));
              }
            })
            .catch((err) => this.destroy(err));
        },
      });
      stream.pipe(bb);
    } else {
      reject(new Error('No request body'));
    }
  });
}
