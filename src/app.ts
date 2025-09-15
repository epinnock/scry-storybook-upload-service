// In src/app.ts

import { Hono } from 'hono';
import type { StorageService } from './services/storage/storage.service';

// Define the application's environment, including injectable variables.
export type AppEnv = {
  Bindings: {}; // Bindings will be defined per-target
  Variables: {
    storage: StorageService;
  };
};

const app = new Hono<AppEnv>();

// Define a shared API route group.
const apiRoutes = app
 .post('/upload/:project/:version', async (c) => {
    // 1. Access the injected StorageService from the context.
    const storage = c.var.storage;
    const { project, version } = c.req.param();

    // This logic is now completely portable.
    // It depends on the StorageService abstraction, not a concrete implementation.
    const key = `${project}/${version}/storybook.zip`;

    if (!c.req.body) {
      return c.json({ error: 'Request body is empty' }, 400);
    }

    const result = await storage.upload(key, c.req.body, 'application/zip');

    return c.json({ message: 'Upload successful', data: result }, 201);
  })
 .post('/presigned-url/:project/:version/:filename', async (c) => {
    const storage = c.var.storage;
    const { project, version, filename } = c.req.param();
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';

    const key = `${project}/${version}/${filename}`;

    const data = await storage.getPresignedUploadUrl(key, contentType);

    return c.json(data);
  });

// Export the app instance to be used by the entry points.
export { app };

// Export the type for use in route definitions.
export type ApiRoutes = typeof apiRoutes;
