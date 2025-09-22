// In src/app.ts

import { Hono } from 'hono';
import type { StorageService } from './services/storage/storage.service.js';

// Define the application's environment, including injectable variables.
export type AppEnv = {
  Bindings: {}; // Bindings will be defined per-target
  Variables: {
    storage: StorageService;
  };
};

const app = new Hono<AppEnv>();

// Add health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Define a shared API route group.
const apiRoutes = app
 .post('/upload/:project/:version', async (c) => {
    // 1. Access the injected StorageService from the context.
    const storage = c.var.storage;
    const { project, version } = c.req.param();

    // This logic is now completely portable.
    // It depends on the StorageService abstraction, not a concrete implementation.
    const filename = 'storybook.zip'; // Default or from form
    const key = `${project}/${version}/${filename}`;

    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    if (!file || file.size === 0) {
      return c.json({ error: 'No file provided or empty file' }, 400);
    }

    const contentType = file.type || 'application/zip';
    const body = file.stream();

    const result = await storage.upload(key, body, contentType);

    return c.json({ message: 'Upload successful', data: result }, 201);
  })
 .post('/presigned-url/:project/:version/:filename', async (c) => {
    const storage = c.var.storage;
    const { project, version, filename } = c.req.param();
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';

    const key = `${project}/${version}/${filename}`;

    const data = await storage.getPresignedUploadUrl(key, contentType);

    return c.json(data);
  })
 .delete('/cleanup/:project/:version', async (c) => {
    // Protected route for E2E test cleanup
    const cleanupHeader = c.req.header('X-Test-Cleanup');
    if (cleanupHeader !== 'true') {
      return c.json({ error: 'Unauthorized cleanup request' }, 401);
    }

    const storage = c.var.storage;
    const { project, version } = c.req.param();
    const prefix = `${project}/${version}/`;

    await storage.deleteByPrefix(prefix);

    return c.json({ message: 'Cleanup completed' }, 200);
  });

// Export the app instance to be used by the entry points.
export { app };

// Export the type for use in route definitions.
export type ApiRoutes = typeof apiRoutes;
