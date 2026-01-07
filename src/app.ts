// In src/app.ts

import { Hono } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { swaggerUI } from '@hono/swagger-ui';
import { logger } from 'hono/logger';
import type { StorageService } from './services/storage/storage.service.js';
import type { FirestoreService } from './services/firestore/firestore.service.js';
import type { BuildCoverage, CreateBuildData } from './services/firestore/firestore.types.js';
import type { ApiKeyService } from './services/apikey/apikey.service.js';
import { apiKeyAuth, type AuthVariables } from './middleware/auth.js';
import { normalizeCoverageInput } from './coverage/coverage.js';
import { parseMultipartFormData } from './utils/multipart.js';

// Define the application's environment, including injectable variables.
export type AppEnv = {
  Bindings: {}; // Bindings will be defined per-target
  Variables: {
    storage: StorageService;
    firestore?: FirestoreService; // Optional to support gradual rollout
    apiKeyService?: ApiKeyService; // Optional for API key authentication
  } & AuthVariables;
};

const app = new OpenAPIHono<AppEnv>();

// Add request logging middleware
app.use('*', logger());

// Add API key authentication middleware to protected routes
// This middleware validates the X-API-Key header against Firestore-stored keys
app.use('/upload/*', apiKeyAuth());
app.use('/presigned-url/*', apiKeyAuth());

// Define Zod schemas for parameters and responses
const ProjectVersionParamsSchema = z.object({
  project: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Project name must contain only alphanumeric characters, hyphens, and underscores').openapi({ example: 'my-project' }),
  version: z.string().min(1).openapi({ 
    example: 'v1.0.0',
    description: 'Version identifier - supports semantic versions (v1.0.0), PR builds (pr-001), extended versions (v0.0.0.1), and named releases (beta-2024, dev-123, staging, latest)',
    examples: ['v1.0.0', 'pr-001', 'v0.0.0.1', 'beta-2024', 'dev-snapshot-123', 'staging', 'latest', 'main']
  })
});

const ProjectVersionFilenameParamsSchema = z.object({
  project: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Project name must contain only alphanumeric characters, hyphens, and underscores').openapi({ example: 'my-project' }),
  version: z.string().min(1).openapi({ example: '1.0.0' }),
  filename: z.string().openapi({ example: 'storybook.zip' })
});

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  key: z.string(),
  data: z.object({
    url: z.string(),
    path: z.string(),
    versionId: z.string().optional(),
    buildId: z.string().optional(),
    buildNumber: z.number().optional(),
    coverageUrl: z.string().optional(),
  })
});

const PresignedUrlResponseSchema = z.object({
  url: z.string(),
  fields: z.object({
    key: z.string()
  }),
  buildId: z.string().optional(),
  buildNumber: z.number().optional()
});

const CleanupResponseSchema = z.object({
  message: z.string()
});

const ErrorResponseSchema = z.object({
  error: z.string()
});

const AuthErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string()
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
      description: 'No file provided, empty file, or validation error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    },
    401: {
      description: 'Unauthorized - Invalid or missing API key',
      content: {
        'application/json': {
          schema: AuthErrorResponseSchema
        }
      }
    },
    403: {
      description: 'Forbidden - API key does not belong to the requested project',
      content: {
        'application/json': {
          schema: AuthErrorResponseSchema
        }
      }
    },
    413: {
      description: 'File too large',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

app.openapi(uploadRoute, async (c) => {
  try {
    const storage = c.var.storage;
    const firestore = c.var.firestore;
    const { project, version } = c.req.valid('param');

    // Validate project and version
    if (!project || project.trim() === '') {
      return c.json({ error: 'Project name is required' }, 400);
    }
    if (!version || version.trim() === '') {
      return c.json({ error: 'Version is required' }, 400);
    }

    const filename = 'storybook.zip'; // Default or from form
    const key = `${project}/${version}/${filename}`;

    // Enforce a simple request size limit. For large bodies, some runtimes may
    // fail while streaming/parsing; checking Content-Length allows us to return
    // a consistent 413 response early when available.
    const maxSize = 5 * 1024 * 1024; // 5MB
    const contentLengthHeader = c.req.header('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isNaN(contentLength) && contentLength > maxSize) {
        return c.json({ error: 'File too large. Maximum size is 5MB' }, 413);
      }
    }

    // Handle both multipart form data and raw binary uploads
    let file: File;
    let coveragePayload: unknown | undefined;
    let coverageUrl: string | undefined;

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data
      try {
        // First try Hono's built-in formData method
        const formData = await c.req.formData();
        file = formData.get('file') as File;

        if (!file || file.size === 0) {
          throw new Error('No file in FormData');
        }

        const coverageFile = formData.get('coverage') as File | null;
        const coverageJson = formData.get('coverageJson') as string | null;

        if (coverageFile) {
          const text = await coverageFile.text();
          try {
            coveragePayload = JSON.parse(text);
          } catch {
            return c.json({ error: 'Invalid coverage JSON' }, 400);
          }
        } else if (coverageJson) {
          try {
            coveragePayload = JSON.parse(coverageJson);
          } catch {
            return c.json({ error: 'Invalid coverage JSON' }, 400);
          }
        }
      } catch (formDataError) {
        console.log(
          'Hono FormData parsing failed, trying busboy fallback:',
          formDataError instanceof Error ? formDataError.message : String(formDataError)
        );

        // Fallback to busboy parser for Node.js compatibility
        try {
          const parsed = await parseMultipartFormData(c.req.raw);
          file = parsed.files.file;

          if (!file || file.size === 0) {
            return c.json({ error: 'No file provided or empty file' }, 400);
          }

          const coverageFile = parsed.files.coverage;
          const coverageJson = parsed.fields.coverageJson;

          if (coverageFile) {
            const text = await coverageFile.text();
            try {
              coveragePayload = JSON.parse(text);
            } catch {
              return c.json({ error: 'Invalid coverage JSON' }, 400);
            }
          } else if (coverageJson) {
            try {
              coveragePayload = JSON.parse(coverageJson);
            } catch {
              return c.json({ error: 'Invalid coverage JSON' }, 400);
            }
          }
        } catch (busboyError) {
          console.error('Busboy parsing failed:', busboyError);
          return c.json(
            {
              error:
                'Failed to parse file upload. Please ensure you are sending a valid multipart/form-data request with a file field named "file".',
            },
            400
          );
        }
      }

      // If coverage was provided, upload the raw JSON to storage.
      if (coveragePayload) {
        try {
          const coverageKey = `${project}/${version}/coverage-report.json`;
          const coverageBody = new Blob([JSON.stringify(coveragePayload)]).stream();
          const coverageResult = await storage.upload(coverageKey, coverageBody, 'application/json');
          coverageUrl = coverageResult.url;
        } catch (coverageUploadError) {
          console.error('Coverage upload error:', coverageUploadError);
          return c.json({ error: 'Failed to upload coverage report' }, 500);
        }
      }
    } else {
      // Handle raw binary upload (e.g., application/zip, application/octet-stream)
      try {
        const body = await c.req.arrayBuffer();
        if (!body || body.byteLength === 0) {
          return c.json({ error: 'No file data received' }, 400);
        }
        
        // Determine the MIME type from the Content-Type header or default to application/zip
        const mimeType = contentType || 'application/zip';
        file = new File([body], filename, { type: mimeType });
        
        console.log(`Received raw binary upload: ${body.byteLength} bytes, type: ${mimeType}`);
      } catch (bodyError) {
        console.error('Raw body parsing failed:', bodyError);
        return c.json({ error: 'Failed to parse raw file upload' }, 400);
      }
    }

    // Check file size limit (5MB)
    if (file.size > maxSize) {
      return c.json({ error: 'File too large. Maximum size is 5MB' }, 413);
    }

    const fileContentType = file.type || 'application/zip';
    const body = file.stream();

    const result = await storage.upload(key, body, fileContentType);

    // Create Firestore build record if Firestore is configured
    let buildId: string | undefined;
    let buildNumber: number | undefined;
    
    if (firestore) {
      try {
        const buildData: CreateBuildData = {
          versionId: version,
          zipUrl: result.url,
          ...(coveragePayload && coverageUrl
            ? {
                coverage: normalizeCoverageInput(coveragePayload, {
                  reportUrl: coverageUrl,
                }) as BuildCoverage,
              }
            : {}),
        };

        const build = await firestore.createBuild(project, buildData);
        buildId = build.id;
        buildNumber = build.buildNumber;
      } catch (firestoreError) {
        // Log error but don't fail the upload
        console.error('Firestore error (upload succeeded):', firestoreError);
      }
    }

    return c.json(
      {
        success: true,
        message: 'Upload successful',
        key: key,
        data: {
          ...result,
          ...(buildId && { buildId }),
          ...(buildNumber !== undefined && { buildNumber }),
          ...(coverageUrl && { coverageUrl }),
        },
      },
      201
    );
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({
      error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, 500);
  }
});

const CoverageUploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  buildId: z.string(),
  coverageUrl: z.string().optional(),
});

// Coverage upload route - upload JSON and update build
const coverageUploadRoute = createRoute({
  method: 'post',
  path: '/upload/:project/:version/coverage',
  request: {
    params: ProjectVersionParamsSchema,
  },
  responses: {
    201: {
      description: 'Coverage upload successful',
      content: {
        'application/json': {
          schema: CoverageUploadResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid coverage data',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: AuthErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Build not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(coverageUploadRoute, async (c) => {
  try {
    const storage = c.var.storage;
    const firestore = c.var.firestore;
    const { project, version } = c.req.valid('param');

    if (!firestore) {
      return c.json({ error: 'Firestore not configured' }, 500);
    }

    // Find the build for this version
    const build = await firestore.getBuildByVersion(project, version);
    if (!build) {
      return c.json({ error: 'Build not found for this version' }, 404);
    }

    // Handle both JSON body and multipart form data
    const contentType = c.req.header('content-type') || '';
    let coveragePayload: unknown;

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart - coverage JSON file upload
      try {
        const formData = await c.req.formData();
        const file = (formData.get('file') as File | null) || (formData.get('coverage') as File | null);

        if (!file) {
          return c.json({ error: 'No coverage file provided' }, 400);
        }

        const fileContent = await file.text();
        coveragePayload = JSON.parse(fileContent);
      } catch (e) {
        // Fallback to busboy parser for Node.js compatibility
        try {
          const parsed = await parseMultipartFormData(c.req.raw);
          const file = parsed.files.file || parsed.files.coverage;

          if (!file) {
            return c.json({ error: 'No coverage file provided' }, 400);
          }

          const fileContent = await file.text();
          coveragePayload = JSON.parse(fileContent);
        } catch {
          return c.json({ error: 'Invalid coverage JSON' }, 400);
        }
      }
    } else {
      try {
        coveragePayload = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid coverage JSON' }, 400);
      }
    }

    // Always upload raw JSON to R2
    const coverageKey = `${project}/${version}/coverage-report.json`;
    const coverageBody = new Blob([JSON.stringify(coveragePayload)]).stream();
    const coverageResult = await storage.upload(coverageKey, coverageBody, 'application/json');

    let coverage: BuildCoverage;
    try {
      coverage = normalizeCoverageInput(coveragePayload, {
        reportUrl: coverageResult.url,
      }) as BuildCoverage;
    } catch (e) {
      return c.json({ error: 'Invalid coverage data' }, 400);
    }

    // Update build with coverage data
    await firestore.updateBuildCoverage(project, build.id, coverage);

    return c.json(
      {
        success: true,
        message: 'Coverage uploaded successfully',
        buildId: build.id,
        coverageUrl: coverageResult.url,
      },
      201
    );
  } catch (error) {
    console.error('Coverage upload error:', error);
    return c.json(
      {
        error: `Coverage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500
    );
  }
});

// File retrieval route
const retrievalRoute = createRoute({
  method: 'get',
  path: '/upload/:project/:version',
  request: {
    params: ProjectVersionParamsSchema
  },
  responses: {
    200: {
      description: 'File information retrieved',
      content: {
        'application/json': {
          schema: z.object({
            project: z.string(),
            version: z.string(),
            key: z.string(),
            available: z.boolean()
          })
        }
      }
    },
    404: {
      description: 'File not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

app.openapi(retrievalRoute, async (c) => {
  const { project, version } = c.req.valid('param');
  const key = `${project}/${version}/storybook.zip`;
  
  // For now, return a simple response. In a real implementation, 
  // you might check if the file exists in storage
  return c.json({
    project,
    version,
    key,
    available: true
  }, 200);
});

// Presigned URL route
const presignedUrlRoute = createRoute({
  method: 'post',
  path: '/presigned-url/:project/:version/:filename',
  request: {
    params: ProjectVersionFilenameParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            contentType: z.string().optional()
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Presigned URL data with build tracking',
      content: {
        'application/json': {
          schema: PresignedUrlResponseSchema
        }
      }
    },
    401: {
      description: 'Unauthorized - Invalid or missing API key',
      content: {
        'application/json': {
          schema: AuthErrorResponseSchema
        }
      }
    },
    403: {
      description: 'Forbidden - API key does not belong to the requested project',
      content: {
        'application/json': {
          schema: AuthErrorResponseSchema
        }
      }
    }
  }
});

app.openapi(presignedUrlRoute, async (c) => {
  const storage = c.var.storage;
  const firestore = c.var.firestore;
  const { project, version, filename } = c.req.valid('param');
  
  let contentType = 'application/octet-stream';
  
  try {
    const body = await c.req.json();
    contentType = body.contentType || contentType;
  } catch (e) {
    // If no JSON body, use default content type
  }

  const key = `${project}/${version}/${filename}`;

  const data = await storage.getPresignedUploadUrl(key, contentType);

  // Create Firestore build record if Firestore is configured
  let buildId: string | undefined;
  let buildNumber: number | undefined;
  
  if (firestore) {
    try {
      // Construct the URL that will be available after upload
      const zipUrl = data.url.split('?')[0]; // Remove query parameters to get the base URL
      
      const build = await firestore.createBuild(project, {
        versionId: version,
        zipUrl: zipUrl
      });
      buildId = build.id;
      buildNumber = build.buildNumber;
      
      console.log(`[INFO] Build record created for presigned upload: ID=${buildId}, Number=${buildNumber}`);
    } catch (firestoreError) {
      // Log error but don't fail the presigned URL generation
      console.error('Firestore error (presigned URL succeeded):', firestoreError);
    }
  }

  // Format response to match test expectations and include build data
  return c.json({
    url: data.url,
    fields: {
      key: data.key
    },
    ...(buildId && { buildId }),
    ...(buildNumber !== undefined && { buildNumber })
  }, 200);
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
