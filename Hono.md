# Hono Framework Guide: Understanding How Hono Powers This Application

This guide will take you from knowing nothing about Hono to fully understanding how it's used in this Portable Storybook Upload Service. By the end, you'll understand both the framework itself and how it enables this application's portability between Cloudflare Workers and Node.js environments.

## Table of Contents

1. [What is Hono?](#what-is-hono)
2. [Why Hono for This Project?](#why-hono-for-this-project)
3. [Hono Fundamentals](#hono-fundamentals)
4. [Application Architecture Overview](#application-architecture-overview)
5. [Core Implementation Patterns](#core-implementation-patterns)
6. [Environment-Specific Entry Points](#environment-specific-entry-points)
7. [Dependency Injection Pattern](#dependency-injection-pattern)
8. [Type Safety and TypeScript Integration](#type-safety-and-typescript-integration)
9. [Route Organization and Mounting](#route-organization-and-mounting)
10. [Request/Response Handling](#requestresponse-handling)
11. [Complete Code Walkthrough](#complete-code-walkthrough)
12. [Key Takeaways](#key-takeaways)

## What is Hono?

[Hono](https://hono.dev/) is a small, simple, and ultrafast web framework for JavaScript/TypeScript. It's designed to work across multiple JavaScript runtimes:

- **Cloudflare Workers** (edge computing)
- **Node.js** (traditional server)
- **Deno** (secure runtime)
- **Bun** (fast all-in-one toolkit)

The name "Hono" means "flame" in Japanese, representing its speed and efficiency.

### Key Characteristics

- **Lightweight**: Minimal bundle size and memory footprint
- **Fast**: Optimized for performance across all runtimes
- **Runtime Agnostic**: Write once, deploy anywhere
- **TypeScript First**: Excellent type safety and developer experience
- **Modern**: Built with modern JavaScript features and patterns

## Why Hono for This Project?

This Storybook Upload Service needed to be **portable** - capable of running in both:

1. **Cloudflare Workers** (serverless edge environment)
2. **Node.js** (traditional server environment)

Hono was chosen because:

1. **Cross-Platform Compatibility**: Single codebase works in both environments
2. **Minimal Adaptation Required**: Only entry points need to be environment-specific
3. **Performance**: Excellent performance in both edge and server environments
4. **Type Safety**: Strong TypeScript support prevents runtime errors
5. **Middleware System**: Perfect for dependency injection patterns

## Hono Fundamentals

Before diving into the application, let's understand Hono's core concepts:

### Basic Hono Application

```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

export default app
```

### Key Concepts

1. **Context (`c`)**: Contains request data, response methods, and environment variables
2. **Middleware**: Functions that execute before/after route handlers
3. **Environment Types**: TypeScript interfaces defining available bindings and variables
4. **Adapters**: Runtime-specific modules that connect Hono to different platforms

## Application Architecture Overview

Our application uses a **three-layer architecture**:

```
┌─────────────────────────────────────────┐
│             Entry Points                │
│  ┌─────────────────┐ ┌─────────────────┐│
│  │ entry.node.ts   │ │ entry.worker.ts ││
│  │ (Node.js)       │ │ (Cloudflare)    ││
│  └─────────────────┘ └─────────────────┘│
└─────────────────┬───────────────────────┘
                  │ Both mount shared app
┌─────────────────▼───────────────────────┐
│            Shared App Layer             │
│  ┌─────────────────────────────────────┐ │
│  │           app.ts                    │ │
│  │  (Portable route definitions)      │ │
│  └─────────────────────────────────────┘ │
└─────────────────┬───────────────────────┘
                  │ Uses injected services
┌─────────────────▼───────────────────────┐
│           Service Layer                 │
│  ┌─────────────────┐ ┌─────────────────┐ │
│  │ storage.node.ts │ │storage.worker.ts│ │
│  │ (S3 SDK)        │ │(R2 + S3 hybrid)│ │
│  └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────┘
```

## Core Implementation Patterns

### 1. Shared Application Definition

The core application logic is defined once in [`src/app.ts`](src/app.ts):

```typescript
import { Hono } from 'hono';
import type { StorageService } from './services/storage/storage.service';

// Define the application's environment type
export type AppEnv = {
  Bindings: {}; // Will be extended by entry points
  Variables: {
    storage: StorageService; // Injected dependency
  };
};

const app = new Hono<AppEnv>();

// Define routes that work in any environment
const apiRoutes = app
  .post('/upload/:project/:version', async (c) => {
    // Access injected storage service
    const storage = c.var.storage;
    const { project, version } = c.req.param();
    
    // Portable business logic
    const key = `${project}/${version}/storybook.zip`;
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

export { app };
```

### 2. Environment-Specific Bindings

Each environment extends the base `AppEnv` with its own bindings:

**Node.js Environment** ([`src/entry.node.ts`](src/entry.node.ts)):
```typescript
// Node.js doesn't need special bindings, just Variables
const nodeApp = new Hono<AppEnv>();
```

**Cloudflare Worker Environment** ([`src/entry.worker.ts`](src/entry.worker.ts)):
```typescript
type Bindings = {
  STORYBOOK_BUCKET: R2Bucket;          // Native R2 bucket binding
  R2_ACCOUNT_ID: string;               // Environment secrets
  R2_S3_ACCESS_KEY_ID: string;
  R2_S3_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
};

// Extend AppEnv with Cloudflare-specific bindings
const workerApp = new Hono<AppEnv & { Bindings: Bindings }>();
```

## Environment-Specific Entry Points

### Node.js Entry Point

The Node.js entry point ([`src/entry.node.ts`](src/entry.node.ts)) handles:

1. **Environment Configuration**: Loads config from `.env` file
2. **Service Instantiation**: Creates Node.js-compatible storage service
3. **Dependency Injection**: Injects service via middleware
4. **Server Startup**: Uses `@hono/node-server` adapter

```typescript
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { app } from './app';
import { R2S3StorageService } from './services/storage/storage.node';
import 'dotenv/config';

// Load configuration from environment variables
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_S3_SECRET_ACCESS_KEY!,
    bucketName: process.env.R2_BUCKET_NAME!,
  },
};

const nodeApp = new Hono<AppEnv>();

// Middleware: Inject storage service into every request
nodeApp.use('*', async (c, next) => {
  const storageService = new R2S3StorageService(config.r2);
  c.set('storage', storageService);
  await next();
});

// Mount shared application routes
nodeApp.route('/', app);

// Start Node.js server
serve({
  fetch: nodeApp.fetch,
  port: config.port,
});
```

### Cloudflare Worker Entry Point

The Cloudflare Worker entry point ([`src/entry.worker.ts`](src/entry.worker.ts)) handles:

1. **Binding Access**: Uses native Cloudflare bindings
2. **Service Instantiation**: Creates Worker-compatible storage service
3. **Dependency Injection**: Injects service via middleware
4. **Worker Export**: Exports object conforming to Worker API

```typescript
import { Hono } from 'hono';
import { app } from './app';
import { R2S3StorageService } from './services/storage/storage.worker';

type Bindings = {
  STORYBOOK_BUCKET: R2Bucket;
  R2_ACCOUNT_ID: string;
  R2_S3_ACCESS_KEY_ID: string;
  R2_S3_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
};

const workerApp = new Hono<AppEnv & { Bindings: Bindings }>();

// Middleware: Inject storage service into every request
workerApp.use('*', async (c, next) => {
  // Extract configuration from Cloudflare environment
  const r2Config = {
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_S3_SECRET_ACCESS_KEY,
    bucketName: c.env.R2_BUCKET_NAME,
  };

  // Create hybrid storage service (R2 binding + S3 SDK)
  const storageService = new R2S3StorageService(c.env.STORYBOOK_BUCKET, r2Config);
  c.set('storage', storageService);
  
  await next();
});

// Mount shared application routes
workerApp.route('/', app);

// Export Worker-compatible object
export default {
  fetch: workerApp.fetch,
};
```

## Dependency Injection Pattern

The application uses Hono's middleware system for dependency injection:

### Pattern Overview

1. **Interface Definition**: [`StorageService`](src/services/storage/storage.service.ts) interface defines the contract
2. **Multiple Implementations**: Different implementations for Node.js and Workers
3. **Middleware Injection**: Entry points inject the appropriate implementation
4. **Route Consumption**: Shared routes access the service via `c.var.storage`

### Benefits

- **Testability**: Easy to mock services for testing
- **Flexibility**: Can swap implementations without changing routes
- **Portability**: Same route code works with different service implementations
- **Type Safety**: TypeScript ensures correct service interface usage

### Implementation Details

```typescript
// In middleware (entry points)
nodeApp.use('*', async (c, next) => {
  const storageService = new R2S3StorageService(config.r2);
  c.set('storage', storageService); // Inject into context
  await next();
});

// In routes (shared app)
app.post('/upload/:project/:version', async (c) => {
  const storage = c.var.storage; // Access injected service
  // Use service methods...
});
```

## Type Safety and TypeScript Integration

Hono provides excellent TypeScript support through environment typing:

### Environment Type Definition

```typescript
export type AppEnv = {
  Bindings: {}; // Platform-specific bindings (R2, KV, etc.)
  Variables: {   // Request-scoped variables
    storage: StorageService;
  };
};
```

### Benefits of Type Safety

1. **Compile-Time Validation**: Catches errors before runtime
2. **IDE Autocomplete**: Better developer experience
3. **Refactoring Safety**: Changes are validated across codebase
4. **Documentation**: Types serve as inline documentation

### Context Type Safety

```typescript
// TypeScript knows the exact shape of c.var and c.env
app.post('/upload', async (c) => {
  const storage = c.var.storage; // ✅ TypeScript knows this is StorageService
  const bucket = c.env.STORYBOOK_BUCKET; // ✅ Available in Worker environment
});
```

## Route Organization and Mounting

### Route Definition Pattern

Routes are defined as a group and then mounted:

```typescript
// Define route group
const apiRoutes = app
  .post('/upload/:project/:version', uploadHandler)
  .post('/presigned-url/:project/:version/:filename', presignedUrlHandler);

// Export for type inference
export type ApiRoutes = typeof apiRoutes;
```

### Route Mounting

Entry points mount the shared routes:

```typescript
// Mount shared routes at root
nodeApp.route('/', app);
workerApp.route('/', app);
```

### Benefits

- **Single Source of Truth**: Routes defined once, used everywhere
- **Type Inference**: Hono can infer route types for client generation
- **Modularity**: Easy to organize routes into logical groups

## Request/Response Handling

### Request Parameter Access

```typescript
app.post('/upload/:project/:version', async (c) => {
  // URL parameters
  const { project, version } = c.req.param();
  
  // Query parameters
  const force = c.req.query('force');
  
  // Headers
  const contentType = c.req.header('Content-Type');
  
  // Body
  const body = c.req.body; // ReadableStream for uploads
});
```

### Response Generation

```typescript
// JSON responses
return c.json({ message: 'Success', data: result }, 201);

// Text responses
return c.text('Hello World');

// Custom responses
return c.body('binary data', 200, {
  'Content-Type': 'application/octet-stream'
});
```

### Error Handling

```typescript
app.post('/upload/:project/:version', async (c) => {
  try {
    if (!c.req.body) {
      return c.json({ error: 'Request body is empty' }, 400);
    }
    
    const result = await storage.upload(key, c.req.body, contentType);
    return c.json({ message: 'Upload successful', data: result }, 201);
  } catch (error) {
    return c.json({ error: 'Upload failed' }, 500);
  }
});
```

## Complete Code Walkthrough

Let's trace through a complete request to understand how everything works together:

### 1. Request Arrives

A `POST /upload/myproject/v1.0` request arrives with a zip file.

### 2. Environment-Specific Handling

**Node.js**:
```typescript
// entry.node.ts middleware runs
nodeApp.use('*', async (c, next) => {
  // Create Node.js storage service using environment variables
  const storageService = new R2S3StorageService(config.r2);
  c.set('storage', storageService);
  await next(); // Continue to shared routes
});
```

**Cloudflare Worker**:
```typescript
// entry.worker.ts middleware runs
workerApp.use('*', async (c, next) => {
  // Create Worker storage service using bindings and secrets
  const storageService = new R2S3StorageService(c.env.STORYBOOK_BUCKET, r2Config);
  c.set('storage', storageService);
  await next(); // Continue to shared routes
});
```

### 3. Shared Route Handling

```typescript
// app.ts route handler runs (same code for both environments)
app.post('/upload/:project/:version', async (c) => {
  // Access the injected storage service
  const storage = c.var.storage; // TypeScript knows this is StorageService
  
  // Extract parameters
  const { project, version } = c.req.param(); // "myproject", "v1.0"
  
  // Create storage key
  const key = `${project}/${version}/storybook.zip`; // "myproject/v1.0/storybook.zip"
  
  // Validate request
  if (!c.req.body) {
    return c.json({ error: 'Request body is empty' }, 400);
  }
  
  // Upload using environment-appropriate service
  const result = await storage.upload(key, c.req.body, 'application/zip');
  
  // Return success response
  return c.json({ message: 'Upload successful', data: result }, 201);
});
```

### 4. Service Implementation

**Node.js**: Uses AWS S3 SDK to connect to R2's S3-compatible API
**Cloudflare Worker**: Uses native R2 binding for direct uploads

Both implement the same `StorageService` interface, so the route code is identical.

### 5. Response

The response is sent back through the appropriate runtime:
- **Node.js**: Through the Node.js HTTP server
- **Cloudflare Worker**: Through the Worker runtime

## Key Takeaways

### 1. Portability Through Abstraction

Hono enables portability by:
- Providing a consistent API across runtimes
- Supporting environment-specific adapters
- Enabling dependency injection through middleware

### 2. Type Safety

TypeScript integration ensures:
- Compile-time error detection
- Better developer experience
- Safer refactoring

### 3. Performance

- Minimal overhead in both environments
- Optimized for edge computing (Workers)
- Efficient for traditional servers (Node.js)

### 4. Maintainability

- Single codebase for multiple environments
- Clear separation of concerns
- Testable architecture

### 5. Developer Experience

- Familiar Express-like API
- Excellent TypeScript support
- Clear error messages
- Good documentation

## Understanding the Full Application

After reading this guide, you should understand:

1. **What Hono is**: A lightweight, cross-platform web framework
2. **Why it was chosen**: For portability between Cloudflare Workers and Node.js
3. **How it works**: Through shared application logic and environment-specific entry points
4. **The architecture**: Three-layer design with dependency injection
5. **The patterns**: Middleware for injection, type safety for reliability
6. **The implementation**: Specific code organization and request flow

This Storybook Upload Service demonstrates how Hono can be used to build truly portable applications that maintain high performance and type safety across different JavaScript runtimes.