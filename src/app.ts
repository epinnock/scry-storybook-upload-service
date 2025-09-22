// In src/app.ts

import { Hono } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { swaggerUI } from '@hono/swagger-ui';
import type { StorageService } from './services/storage/storage.service.js';

// Define the application's environment, including injectable variables.
export type AppEnv = {
  Bindings: {}; // Bindings will be defined per-target
  Variables: {
    storage: StorageService;
  };
};

const app = new OpenAPIHono<AppEnv>();

// Define Zod schemas for parameters and responses
const ProjectVersionParamsSchema = z.object({
  project: z.string().openapi({ example: 'my-project' }),
  version: z.string().openapi({ example: '1.0.0' })
});

const ProjectVersionFilenameParamsSchema = z.object({
  project: z.string().openapi({ example: 'my-project' }),
  version: z.string().openapi({ example: '1.0.0' }),
  filename: z.string().openapi({ example: 'storybook.zip' })
});

const UploadResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    url: z.string(),
    path: z.string(),
    versionId: z.string().optional()
  })
});

const PresignedUrlResponseSchema = z.object({
  url: z.string(),
  key: z.string()
});

const CleanupResponseSchema = z.object({
  message: z.string()
});

const ErrorResponseSchema = z.object({
  error: z.string()
});

// Health check route
const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      description: 'Health status',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('ok'),
            timestamp: z.string().datetime()
          })
        }
      }
    }
  }
});

app.openapi(healthRoute, (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Upload route
const uploadRoute = createRoute({
  method: 'post',
  path: '/upload/:project/:version',
  request: {
    params: ProjectVersionParamsSchema
  },
  responses: {
    201: {
      description: 'Upload successful',
      content: {
        'application/json': {
          schema: UploadResponseSchema
        }
      }
    },
    400: {
      description: 'No file provided or empty file',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

app.openapi(uploadRoute, async (c) => {
  const storage = c.var.storage;
  const { project, version } = c.req.valid('param');

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
});

// Presigned URL route
const presignedUrlRoute = createRoute({
  method: 'post',
  path: '/presigned-url/:project/:version/:filename',
  request: {
    params: ProjectVersionFilenameParamsSchema
  },
  responses: {
    200: {
      description: 'Presigned URL data',
      content: {
        'application/json': {
          schema: PresignedUrlResponseSchema
        }
      }
    }
  }
});

app.openapi(presignedUrlRoute, async (c) => {
  const storage = c.var.storage;
  const { project, version, filename } = c.req.valid('param');
  const contentType = c.req.header('Content-Type') || 'application/octet-stream';

  const key = `${project}/${version}/${filename}`;

  const data = await storage.getPresignedUploadUrl(key, contentType);

  return c.json(data);
});

// Cleanup route
const cleanupRoute = createRoute({
  method: 'delete',
  path: '/cleanup/:project/:version',
  request: {
    params: ProjectVersionParamsSchema
  },
  responses: {
    200: {
      description: 'Cleanup completed',
      content: {
        'application/json': {
          schema: CleanupResponseSchema
        }
      }
    },
    401: {
      description: 'Unauthorized cleanup request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

app.openapi(cleanupRoute, async (c) => {
  const cleanupHeader = c.req.header('X-Test-Cleanup');
  if (cleanupHeader !== 'true') {
    return c.json({ error: 'Unauthorized cleanup request' }, 401);
  }

  const storage = c.var.storage;
  const { project, version } = c.req.valid('param');
  const prefix = `${project}/${version}/`;

  await storage.deleteByPrefix(prefix);

  return c.json({ message: 'Cleanup completed' }, 200);
});

// Serve OpenAPI spec
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Storybook Upload Service API',
    version: '1.0.0',
    description: 'A portable Storybook upload service for Cloudflare Workers and Node.js'
  }
});

// Serve interactive docs with Swagger UI
app.get('/docs', swaggerUI({
  url: '/openapi.json'
}));

// Export the app instance to be used by the entry points.
export { app };

// Export the type for use in route definitions.
export type ApiRoutes = typeof app;
