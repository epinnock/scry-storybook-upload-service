# Scry Storybook Upload Service - Implementation Plan

**Project**: scry-storybook-upload-service  
**Phase**: Phase 1 - Core Services  
**Priority**: High  
**Estimated Effort**: 2-3 days  
**Owner**: Backend Engineering Team

---

## Overview

This implementation plan details the changes required to support multiple builds per version in the upload service. The service will generate unique build numbers, store artifacts in organized directory structures, and provide build metadata in API responses.

---

## Changes Summary

| Component | Files | Lines Changed | Complexity |
|-----------|-------|---------------|------------|
| Storage Service | 2 files | ~50 lines | Medium |
| API Routes | 1 file | ~80 lines | Medium |
| Firestore Schema | 1 file | ~20 lines | Low |
| Tests | 2 files | ~100 lines | Medium |

---

## Detailed Implementation

### 1. Update Storage Key Pattern

**File**: `src/services/storage/storage.service.ts`

**Current Implementation** (lines 210-220):
```typescript
const storageKey = `${project}/${version}/${filename}`;
```

**New Implementation**:
```typescript
// Generate build number using Firestore transaction
const buildNumber = await incrementBuildNumber(project);

// Create build ID for unique identification
const buildId = `build_${Date.now()}_${crypto.randomUUID()}`;

// New storage key pattern with builds subdirectory
const storageKey = `${project}/${version}/builds/${buildNumber}/${filename}`;
```

**Implementation Steps**:
1. Import crypto module for UUID generation
2. Create `incrementBuildNumber()` function using Firestore transaction
3. Update storage key generation logic
4. Return build metadata in response

**Code Changes**:
```typescript
// Add to imports
import { incrementBuildNumber } from './firestore/firestore.service';

// Update uploadFile method
async uploadFile(
  file: File | Buffer,
  project: string,
  version: string,
  filename: string,
  metadata?: Record<string, any>
): Promise<{
  storageKey: string;
  buildNumber: number;
  buildId: string;
  presignedUrl?: string;
}> {
  // Generate build number
  const buildNumber = await incrementBuildNumber(project);
  
  // Generate unique build ID
  const buildId = `build_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
  
  // Create new storage key
  const storageKey = `${project}/${version}/builds/${buildNumber}/${filename}`;
  
  // Upload file
  await this.adapter.uploadFile(file, storageKey, metadata);
  
  return {
    storageKey,
    buildNumber,
    buildId,
    presignedUrl: metadata?.presignedUrl
  };
}
```

---

### 2. Add Build Number Generation

**File**: `src/services/firestore/firestore.service.ts`

**New Function**:
```typescript
/**
 * Atomically increments and returns the build number for a project
 * Uses Firestore transaction to prevent race conditions
 */
export async function incrementBuildNumber(projectId: string): Promise<number> {
  const counterRef = db.collection('projects').doc(projectId).collection('counters').doc('buildNumber');
  
  return await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);
    
    if (!doc.exists) {
      // Initialize counter at 1
      transaction.set(counterRef, { value: 1 });
      return 1;
    }
    
    const currentValue = doc.data()?.value || 0;
    const newValue = currentValue + 1;
    
    transaction.update(counterRef, { value: newValue });
    return newValue;
  });
}
```

**Firestore Schema**:
```
projects/{projectId}/counters/buildNumber
- value: number (auto-incrementing)
```

---

### 3. Update Presigned URL Endpoint

**File**: `src/app.ts`

**Current Route** (lines 85-120):
```typescript
app.post('/presigned-url/:project/:version/:filename', async (c) => {
  // ... existing logic
  const storageKey = `${project}/${version}/${filename}`;
  // ...
});
```

**New Route**:
```typescript
app.post('/presigned-url/:project/:version/:filename', async (c) => {
  const project = c.req.param('project');
  const version = c.req.param('version');
  const filename = c.req.param('filename');
  
  // Validate version format (already supports all formats)
  const versionSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);
  if (!versionSchema.safeParse(version).success) {
    return c.json({ error: 'Invalid version format' }, 400);
  }
  
  try {
    // Generate build number
    const buildNumber = await incrementBuildNumber(project);
    const buildId = `build_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
    
    // New storage key pattern
    const storageKey = `${project}/${version}/builds/${buildNumber}/${filename}`;
    
    // Generate presigned URL
    const presignedUrl = await storageService.generatePresignedUrl(
      storageKey,
      'PUT',
      3600
    );
    
    // Store build metadata in Firestore
    const buildData = {
      id: buildId,
      projectId: project,
      versionId: version,
      buildNumber: buildNumber,
      storageKey: storageKey,
      filename: filename,
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: c.req.header('x-api-key') || 'anonymous'
    };
    
    await db.collection('builds').doc(buildId).set(buildData);
    
    return c.json({
      presignedUrl,
      buildNumber,
      buildId,
      storageKey,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return c.json({ error: 'Failed to generate presigned URL' }, 500);
  }
});
```

---

### 4. Update Direct Upload Endpoint

**File**: `src/app.ts`

**Current Route** (lines 122-150):
```typescript
app.post('/upload/:project/:version', async (c) => {
  // ... existing logic
  const storageKey = `${project}/${version}/storybook.zip`;
  // ...
});
```

**New Route**:
```typescript
app.post('/upload/:project/:version', async (c) => {
  const project = c.req.param('project');
  const version = c.req.param('version');
  
  try {
    const body = await c.req.arrayBuffer();
    const fileBuffer = Buffer.from(body);
    
    // Generate build number
    const buildNumber = await incrementBuildNumber(project);
    const buildId = `build_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
    
    // New storage key pattern
    const storageKey = `${project}/${version}/builds/${buildNumber}/storybook.zip`;
    
    // Upload to storage
    await storageService.uploadFile(
      fileBuffer,
      project,
      version,
      'storybook.zip',
      { buildNumber, buildId }
    );
    
    // Store build metadata
    const buildData = {
      id: buildId,
      projectId: project,
      versionId: version,
      buildNumber: buildNumber,
      storageKey: storageKey,
      filename: 'storybook.zip',
      status: 'completed',
      createdAt: new Date().toISOString(),
      createdBy: c.req.header('x-api-key') || 'anonymous',
      size: fileBuffer.length
    };
    
    await db.collection('builds').doc(buildId).set(buildData);
    
    return c.json({
      success: true,
      buildNumber,
      buildId,
      storageKey,
      message: `Build #${buildNumber} uploaded successfully`
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});
```

---

### 5. Update Build Query Endpoint

**File**: `src/app.ts`

**New Route**:
```typescript
app.get('/builds/:project/:version', async (c) => {
  const project = c.req.param('project');
  const version = c.req.param('version');
  
  try {
    const buildsSnapshot = await db.collection('builds')
      .where('projectId', '==', project)
      .where('versionId', '==', version)
      .orderBy('buildNumber', 'desc')
      .get();
    
    const builds = buildsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return c.json({ builds });
  } catch (error) {
    console.error('Error fetching builds:', error);
    return c.json({ error: 'Failed to fetch builds' }, 500);
  }
});
```

---

### 6. Update Firestore Schema

**File**: `src/services/firestore/firestore.types.ts`

**Add Interface**:
```typescript
export interface Build {
  id: string;
  projectId: string;
  versionId: string;
  buildNumber: number;
  storageKey: string;
  filename: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  createdAt: string;
  createdBy: string;
  size?: number;
  metadata?: Record<string, any>;
}
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/storage.service.test.ts`

```typescript
describe('Storage Service - Build Support', () => {
  test('should generate build number and create storage key with builds subdirectory', async () => {
    const result = await storageService.uploadFile(
      mockFile,
      'myapp',
      'pr-123',
      'storybook.zip'
    );
    
    expect(result.buildNumber).toBeGreaterThan(0);
    expect(result.buildId).toMatch(/^build_\d+_[a-f0-9-]+$/);
    expect(result.storageKey).toMatch(/^myapp\/pr-123\/builds\/\d+\/storybook\.zip$/);
  });
  
  test('should increment build numbers sequentially', async () => {
    const result1 = await storageService.uploadFile(mockFile, 'myapp', 'main', 'storybook.zip');
    const result2 = await storageService.uploadFile(mockFile, 'myapp', 'main', 'storybook.zip');
    
    expect(result2.buildNumber).toBe(result1.buildNumber + 1);
  });
});
```

### Integration Tests

**File**: `e2e/tests/upload.test.ts`

```typescript
describe('Upload API - Multi-Build Support', () => {
  test('POST /upload/:project/:version should create build with numbered subdirectory', async () => {
    const response = await app.request('/upload/myapp/pr-456', {
      method: 'POST',
      body: mockZipBuffer,
      headers: { 'Content-Type': 'application/zip' }
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.buildNumber).toBeDefined();
    expect(data.buildId).toBeDefined();
    expect(data.storageKey).toMatch(/builds\/\d+\/storybook\.zip$/);
  });
  
  test('GET /builds/:project/:version should return all builds for version', async () => {
    // Upload multiple builds
    await app.request('/upload/myapp/feature-x', { method: 'POST', body: mockZipBuffer });
    await app.request('/upload/myapp/feature-x', { method: 'POST', body: mockZipBuffer });
    
    const response = await app.request('/builds/myapp/feature-x');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.builds).toHaveLength(2);
    expect(data.builds[0].buildNumber).toBeGreaterThan(data.builds[1].buildNumber);
  });
});
```

---

## Deployment Checklist

- [ ] Update Firestore security rules for counters collection
- [ ] Deploy new upload service version
- [ ] Run migration script for existing builds (optional)
- [ ] Update API documentation
- [ ] Verify build number generation in production
- [ ] Monitor Firestore transaction performance
- [ ] Validate storage key pattern in R2

---

## Rollback Plan

If issues occur:

1. **Immediate**: Revert to previous service version
2. **Data**: New builds use old pattern, old builds remain accessible
3. **Recovery**: No data loss, builds can be re-uploaded
4. **Time**: < 2 minutes to rollback

---

## Dependencies

- Firestore transaction support (already available)
- Crypto module for UUID generation (Node.js built-in)
- No external dependencies required

---

## Documentation Updates

- Update `README.md` with new API response format
- Update `curl-test-commands.md` with build number examples
- Add build query endpoint documentation
- Update `ORGANIZATION_SUMMARY.md` with new storage pattern

---

**Next**: Review and approve, then proceed to CDN service implementation