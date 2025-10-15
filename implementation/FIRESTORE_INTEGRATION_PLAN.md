# Firestore Integration Plan

## Overview

This plan outlines the integration of Firestore database tracking into the Storybook Upload Service. The integration will track build records when users upload files, following the existing service abstraction pattern used for storage.

## Current Architecture Analysis

### Existing Patterns
- **Service Abstraction**: The project uses a `StorageService` interface with environment-specific implementations:
  - [`storage.node.ts`](src/services/storage/storage.node.ts:1) - Node.js implementation using AWS S3 SDK
  - [`storage.worker.ts`](src/services/storage/storage.worker.ts:1) - Cloudflare Worker implementation using R2 binding
  
- **Dependency Injection**: Services are injected into Hono context via middleware in entry points
  - [`entry.node.ts`](src/entry.node.ts:1) - Node.js entry point
  - [`entry.worker.ts`](src/entry.worker.ts:1) - Cloudflare Worker entry point

### Upload Flow
1. User uploads file via [`POST /upload/:project/:version`](src/app.ts:124)
2. File is validated and stored using `StorageService`
3. Response includes upload details (url, path, versionId)

## Proposed Architecture

### 1. Service Abstraction Pattern

Following the existing `StorageService` pattern, we'll create a `FirestoreService` abstraction:

```
src/services/firestore/
├── firestore.service.ts      # Interface definition
├── firestore.node.ts          # Node.js implementation (Firebase Admin SDK)
├── firestore.worker.ts        # Worker implementation (Firestore REST API)
└── firestore.types.ts         # Shared types and interfaces
```

### 2. Data Model

Based on the provided BuildService, we'll use this structure:

**Firestore Collections:**
- `projects/{projectId}/builds/{buildId}` - Hierarchical structure
- `projects/{projectId}/counters/builds` - Auto-incrementing build numbers

**Build Document Schema:**
```typescript
interface Build {
  id: string;
  projectId: string;
  versionId: string;         // Version from upload endpoint
  buildNumber: number;        // Auto-incrementing per project
  zipUrl: string;            // URL to the uploaded ZIP file
  status: 'active' | 'archived';
  createdAt: Date;
  createdBy: string;         // Service account ID
  archivedAt?: Date;
  archivedBy?: string;
}
```

### 3. Service Interface

```typescript
// src/services/firestore/firestore.service.ts
export interface CreateBuildData {
  versionId: string;
  zipUrl: string;
}

export interface FirestoreService {
  // Create new build record with auto-incrementing buildNumber
  createBuild(
    projectId: string,
    data: CreateBuildData
  ): Promise<Build>;
  
  // Retrieve build by ID
  getBuild(
    projectId: string,
    buildId: string
  ): Promise<Build | null>;
  
  // Get builds for a project with optional filtering
  getProjectBuilds(
    projectId: string,
    statusFilter?: 'active' | 'archived',
    limitCount?: number
  ): Promise<Build[]>;
  
  // Get build by version ID
  getBuildByVersion(
    projectId: string,
    versionId: string
  ): Promise<Build | null>;
  
  // Archive a build
  archiveBuild(
    projectId: string,
    buildId: string
  ): Promise<void>;
}
```

### 4. Implementation Strategy

#### Node.js Implementation
- Use Firebase Admin SDK (`firebase-admin` package)
- Initialize with service account credentials
- Use Firestore transactions for atomic build number increments
- Handle timestamp conversions properly

#### Cloudflare Worker Implementation
- Use Firestore REST API with service account authentication
- Implement transaction logic for build number counter
- Handle authentication token generation/caching
- Consider using D1 or KV for caching if needed

### 5. Integration Points

#### Update [`AppEnv`](src/app.ts:11) Type
```typescript
export type AppEnv = {
  Bindings: {};
  Variables: {
    storage: StorageService;
    firestore: FirestoreService;  // Add this
  };
};
```

#### Update Upload Route Handler
```typescript
// In src/app.ts uploadRoute handler
app.openapi(uploadRoute, async (c) => {
  try {
    const storage = c.var.storage;
    const firestore = c.var.firestore;  // Get firestore service
    const { project, version } = c.req.valid('param');
    
    // ... existing upload logic ...
    
    const result = await storage.upload(key, body, contentType);
    
    // Create Firestore build record
    const build = await firestore.createBuild(project, {
      versionId: version,
      zipUrl: result.url
    });
    
    return c.json({
      success: true,
      message: 'Upload successful',
      key: key,
      data: {
        ...result,
        buildId: build.id,
        buildNumber: build.buildNumber
      }
    }, 201);
  } catch (error) {
    // ... error handling ...
  }
});
```

### 6. Configuration Requirements

> **📖 Detailed Setup Guide**: See [`SERVICE_ACCOUNT_SETUP.md`](SERVICE_ACCOUNT_SETUP.md:1) for complete instructions on configuring your `serviceAccount.json` file for both Node.js and Cloudflare Workers environments.

#### Environment Variables (Node.js)

**Option 1: Using serviceAccount.json file directly (Development)**
```bash
# .env
GOOGLE_APPLICATION_CREDENTIALS="./serviceAccount.json"
FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"
```

**Option 2: Using extracted credentials (Production)**
```bash
# .env
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="service-account@project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"  # Used for createdBy field
```

#### Cloudflare Worker Configuration

**Local Development (.dev.vars)**
```bash
# Extract values from serviceAccount.json
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="service-account@project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"
```

**Production Secrets**
```bash
# Use the extraction script from SERVICE_ACCOUNT_SETUP.md
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY
wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID
```

### 7. Error Handling Strategy

1. **Upload Success, Firestore Failure**: Log error but return successful upload response
2. **Firestore Transaction Conflicts**: Retry logic with exponential backoff
3. **Service Account Auth Failures**: Fail gracefully with clear error messages
4. **Network/Timeout Issues**: Implement timeout and retry mechanisms

### 8. Response Schema Updates

Update [`UploadResponseSchema`](src/app.ts:32):
```typescript
const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  key: z.string(),
  data: z.object({
    url: z.string(),
    path: z.string(),
    versionId: z.string().optional(),
    buildId: z.string(),           // Add this
    buildNumber: z.number()         // Add this
  })
});
```

## Implementation Phases

### Phase 1: Foundation (Core Setup)
1. Install dependencies (`firebase-admin`)
2. Create type definitions ([`firestore.types.ts`](src/services/firestore/firestore.types.ts:1))
3. Define `FirestoreService` interface
4. Set up configuration files

### Phase 2: Node.js Implementation
1. Implement [`firestore.node.ts`](src/services/firestore/firestore.node.ts:1)
2. Add Firebase Admin initialization
3. Implement all interface methods
4. Add transaction handling for build numbers

### Phase 3: Worker Implementation
1. Implement [`firestore.worker.ts`](src/services/firestore/firestore.worker.ts:1)
2. Create REST API client for Firestore
3. Implement authentication token management
4. Handle transaction logic via Firestore API

### Phase 4: Integration
1. Update [`AppEnv`](src/app.ts:11) type definition
2. Inject service in [`entry.node.ts`](src/entry.node.ts:1)
3. Inject service in [`entry.worker.ts`](src/entry.worker.ts:1)
4. Update upload route handler
5. Update response schemas

### Phase 5: Testing & Documentation
1. Add unit tests for both implementations
2. Update E2E tests to verify Firestore records
3. Document setup in README
4. Create configuration examples

## Testing Strategy

### Unit Tests
- Mock Firebase Admin SDK for Node.js tests
- Mock Firestore REST API for Worker tests
- Test transaction handling and retries
- Test error scenarios

### E2E Tests
- Verify build record creation after upload
- Test auto-incrementing build numbers
- Verify data structure and timestamps
- Test across all environments (node, worker, production)

### Integration Tests
- Test concurrent uploads to same project
- Verify transaction atomicity
- Test service account authentication

## Migration Considerations

### For Existing Data
- Create migration script to backfill existing uploads
- Use storage metadata or logs to reconstruct build history
- Generate sequential build numbers for historical data

### Backward Compatibility
- Firestore integration should be optional initially
- Add feature flag to enable/disable tracking
- Gracefully handle Firestore unavailability

## Security Considerations

1. **Service Account Permissions**: Limit to Firestore read/write only
2. **Secret Management**: Use environment variables and Cloudflare secrets
3. **Data Validation**: Validate all inputs before Firestore operations
4. **Rate Limiting**: Consider implementing rate limits per project

## Performance Optimization

1. **Caching**: Cache build counter values in memory (with TTL)
2. **Batch Operations**: Use batch writes for multiple operations
3. **Indexes**: Create composite indexes for common queries
4. **Connection Pooling**: Reuse Firebase Admin instances

## Monitoring & Observability

1. **Logging**: Log all Firestore operations with context
2. **Metrics**: Track operation latency and error rates
3. **Alerts**: Set up alerts for authentication failures
4. **Tracing**: Add distributed tracing for request flow

## Rollback Strategy

1. Keep Firestore integration behind feature flag
2. Monitor error rates during rollout
3. Have script ready to disable Firestore if issues arise
4. Maintain separate storage-only functionality as fallback

## Architecture Diagram

```mermaid
graph TB
    Client[Client Upload Request]
    
    subgraph "Entry Points"
        NodeEntry[entry.node.ts]
        WorkerEntry[entry.worker.ts]
    end
    
    subgraph "Middleware Layer"
        StorageInject[Storage Service Injection]
        FirestoreInject[Firestore Service Injection]
    end
    
    subgraph "Application Layer"
        UploadHandler[Upload Route Handler<br/>app.ts]
    end
    
    subgraph "Service Layer - Storage"
        StorageService[StorageService Interface]
        NodeStorage[R2S3StorageService<br/>Node.js]
        WorkerStorage[R2StorageService<br/>Worker]
    end
    
    subgraph "Service Layer - Firestore"
        FirestoreService[FirestoreService Interface]
        NodeFirestore[FirestoreService<br/>Node.js + Admin SDK]
        WorkerFirestore[FirestoreService<br/>Worker + REST API]
    end
    
    subgraph "External Services"
        R2[Cloudflare R2<br/>File Storage]
        Firestore[Google Firestore<br/>Build Tracking]
    end
    
    Client --> NodeEntry
    Client --> WorkerEntry
    
    NodeEntry --> StorageInject
    NodeEntry --> FirestoreInject
    WorkerEntry --> StorageInject
    WorkerEntry --> FirestoreInject
    
    StorageInject --> UploadHandler
    FirestoreInject --> UploadHandler
    
    UploadHandler --> StorageService
    UploadHandler --> FirestoreService
    
    StorageService --> NodeStorage
    StorageService --> WorkerStorage
    
    FirestoreService --> NodeFirestore
    FirestoreService --> WorkerFirestore
    
    NodeStorage --> R2
    WorkerStorage --> R2
    NodeFirestore --> Firestore
    WorkerFirestore --> Firestore
    
    style UploadHandler fill:#e1f5fe
    style StorageService fill:#f3e5f5
    style FirestoreService fill:#f3e5f5
    style R2 fill:#fff3e0
    style Firestore fill:#fff3e0
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Upload Handler
    participant S as Storage Service
    participant F as Firestore Service
    participant R2 as Cloudflare R2
    participant FB as Firestore DB
    
    C->>H: POST /upload/:project/:version
    H->>H: Validate request
    H->>S: upload(key, file, contentType)
    S->>R2: Store file
    R2-->>S: Return URL & metadata
    S-->>H: Return upload result
    
    Note over H,F: Transaction begins
    H->>F: createBuild(projectId, {versionId, zipUrl})
    F->>FB: Get/Initialize counter
    FB-->>F: Current build number
    F->>FB: Increment counter
    F->>FB: Create build document
    FB-->>F: Build created
    F-->>H: Return build record
    
    H->>C: Return success response with build info
```

## Next Steps

1. **Review this plan** with the team
2. **Set up Firebase project** and service account
3. **Create feature branch** for implementation
4. **Start with Phase 1** (Foundation)
5. **Implement incrementally** following the phases
6. **Test thoroughly** at each phase
7. **Deploy to staging** for validation
8. **Roll out to production** with monitoring

## Questions to Address

- [ ] Which Firebase project should be used?
- [ ] What should the service account ID be?
- [ ] Should we add query endpoints for retrieving builds?
- [ ] Do we need to support build archival via API?
- [ ] Should we track additional metadata (file size, upload duration)?