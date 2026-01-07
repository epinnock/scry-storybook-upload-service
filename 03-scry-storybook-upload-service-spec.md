# scry-storybook-upload-service Implementation Spec

## Overview

Update the upload service to:
- Accept coverage report uploads alongside Storybook builds
- Store coverage data in Firestore Build documents
- Upload coverage JSON to R2 storage

---

## 1. Firestore Types Updates

### File: `src/services/firestore/firestore.types.ts`

Add coverage-related types:

```typescript
// Add new interfaces for coverage
export interface CoverageSummary {
  componentCoverage: number;
  propCoverage: number;
  variantCoverage: number;
  passRate: number;
  totalComponents: number;
  componentsWithStories: number;
  failingStories: number;
}

export interface QualityGateCheck {
  name: string;
  threshold: number;
  actual: number;
  passed: boolean;
}

export interface QualityGateResult {
  passed: boolean;
  checks: QualityGateCheck[];
}

export interface BuildCoverage {
  reportUrl: string;
  summary: CoverageSummary;
  qualityGate: QualityGateResult;
  generatedAt: string;
}

// Update existing Build interface
export interface Build {
  id: string;
  projectId: string;
  versionId: string;
  buildNumber: number;
  zipUrl: string;
  status: BuildStatus;
  createdAt: Date;
  createdBy: string;
  archivedAt?: Date;
  archivedBy?: string;
  // NEW
  coverage?: BuildCoverage;
}

// Update CreateBuildData
export interface CreateBuildData {
  versionId: string;
  zipUrl: string;
  // NEW
  coverage?: BuildCoverage;
}

// Update UpdateBuildData
export interface UpdateBuildData {
  status?: BuildStatus;
  zipUrl?: string;
  // NEW
  coverage?: BuildCoverage;
}
```

---

## 2. Firestore Service Updates

### File: `src/services/firestore/firestore.service.ts`

Add method for updating coverage:

```typescript
export interface FirestoreService {
  // ... existing methods ...
  
  /**
   * Updates coverage data for a build
   * @param projectId The project identifier
   * @param buildId The build identifier
   * @param coverage The coverage data to add
   * @returns A promise that resolves when the update is complete
   */
  updateBuildCoverage(
    projectId: string,
    buildId: string,
    coverage: BuildCoverage
  ): Promise<void>;
}
```

### File: `src/services/firestore/firestore.node.ts`

Implement the coverage update method:

```typescript
async updateBuildCoverage(
  projectId: string,
  buildId: string,
  coverage: BuildCoverage
): Promise<void> {
  const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
  await buildRef.update({ coverage });
}
```

### File: `src/services/firestore/firestore.worker.ts`

Implement for Cloudflare Workers:

```typescript
async updateBuildCoverage(
  projectId: string,
  buildId: string,
  coverage: BuildCoverage
): Promise<void> {
  const path = `projects/${projectId}/builds/${buildId}`;
  
  await this.firestoreRequest('PATCH', path, {
    fields: {
      coverage: this.toFirestoreValue(coverage)
    }
  });
}
```

---

## 3. New Coverage Upload Route

### File: `src/app.ts`

Add a new route for coverage uploads:

```typescript
// Coverage upload schema
const CoverageUploadSchema = z.object({
  reportUrl: z.string().url(),
  summary: z.object({
    componentCoverage: z.number(),
    propCoverage: z.number(),
    variantCoverage: z.number(),
    passRate: z.number(),
    totalComponents: z.number(),
    componentsWithStories: z.number(),
    failingStories: z.number(),
  }),
  qualityGate: z.object({
    passed: z.boolean(),
    checks: z.array(z.object({
      name: z.string(),
      threshold: z.number(),
      actual: z.number(),
      passed: z.boolean(),
    })),
  }),
  generatedAt: z.string(),
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
    let coverageData: any;
    let coverageReportFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart - coverage JSON file upload
      const formData = await c.req.formData();
      coverageReportFile = formData.get('file') as File;
      
      if (!coverageReportFile) {
        return c.json({ error: 'No coverage file provided' }, 400);
      }
      
      const fileContent = await coverageReportFile.text();
      coverageData = JSON.parse(fileContent);
    } else {
      // Handle JSON body with coverage summary
      coverageData = await c.req.json();
    }

    // Upload full coverage report to R2 if file provided
    let reportUrl = coverageData.reportUrl;
    
    if (coverageReportFile) {
      const key = `${project}/${version}/coverage-report.json`;
      const result = await storage.upload(
        key, 
        coverageReportFile.stream(), 
        'application/json'
      );
      reportUrl = result.url;
    }

    // Validate and extract coverage summary
    const coverage: BuildCoverage = {
      reportUrl,
      summary: {
        componentCoverage: coverageData.summary?.metrics?.componentCoverage ?? coverageData.summary?.componentCoverage,
        propCoverage: coverageData.summary?.metrics?.propCoverage ?? coverageData.summary?.propCoverage,
        variantCoverage: coverageData.summary?.metrics?.variantCoverage ?? coverageData.summary?.variantCoverage,
        passRate: coverageData.summary?.health?.passRate ?? coverageData.summary?.passRate,
        totalComponents: coverageData.summary?.totalComponents,
        componentsWithStories: coverageData.summary?.componentsWithStories,
        failingStories: coverageData.summary?.health?.failingStories ?? coverageData.summary?.failingStories,
      },
      qualityGate: coverageData.qualityGate,
      generatedAt: coverageData.generatedAt,
    };

    // Update build with coverage data
    await firestore.updateBuildCoverage(project, build.id, coverage);

    return c.json({
      success: true,
      message: 'Coverage uploaded successfully',
      buildId: build.id,
      coverageUrl: reportUrl,
    }, 201);
  } catch (error) {
    console.error('Coverage upload error:', error);
    return c.json({
      error: `Coverage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }, 500);
  }
});

// Add auth middleware for coverage route
app.use('/upload/*/coverage', apiKeyAuth());
```

---

## 4. Update Main Upload Route

### File: `src/app.ts`

Modify the existing upload route to optionally accept coverage:

```typescript
// Update UploadResponseSchema to include coverage
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
    // NEW
    coverageUrl: z.string().optional(),
  }),
});

// In the upload handler, check for coverage in form data
app.openapi(uploadRoute, async (c) => {
  try {
    // ... existing code ...

    // Check for coverage report in form data
    let coverageReport: any = null;
    let coverageUrl: string | undefined;
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      file = formData.get('file') as File;
      
      // Check for coverage file
      const coverageFile = formData.get('coverage') as File;
      if (coverageFile) {
        const coverageContent = await coverageFile.text();
        coverageReport = JSON.parse(coverageContent);
        
        // Upload coverage JSON
        const coverageKey = `${project}/${version}/coverage-report.json`;
        const coverageResult = await storage.upload(
          coverageKey,
          new Blob([coverageContent]).stream(),
          'application/json'
        );
        coverageUrl = coverageResult.url;
      }
      
      // Also check for coverage JSON field
      const coverageJson = formData.get('coverageJson') as string;
      if (coverageJson && !coverageReport) {
        coverageReport = JSON.parse(coverageJson);
      }
    }

    // ... existing upload code ...

    // Create Firestore build record with coverage
    if (firestore) {
      try {
        const buildData: CreateBuildData = {
          versionId: version,
          zipUrl: result.url,
        };
        
        // Add coverage if provided
        if (coverageReport && coverageUrl) {
          buildData.coverage = {
            reportUrl: coverageUrl,
            summary: {
              componentCoverage: coverageReport.summary.metrics.componentCoverage,
              propCoverage: coverageReport.summary.metrics.propCoverage,
              variantCoverage: coverageReport.summary.metrics.variantCoverage,
              passRate: coverageReport.summary.health.passRate,
              totalComponents: coverageReport.summary.totalComponents,
              componentsWithStories: coverageReport.summary.componentsWithStories,
              failingStories: coverageReport.summary.health.failingStories,
            },
            qualityGate: coverageReport.qualityGate,
            generatedAt: coverageReport.generatedAt,
          };
        }
        
        const build = await firestore.createBuild(project, buildData);
        buildId = build.id;
        buildNumber = build.buildNumber;
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
      }
    }

    return c.json({
      success: true,
      message: 'Upload successful',
      key: key,
      data: {
        ...result,
        ...(buildId && { buildId }),
        ...(buildNumber !== undefined && { buildNumber }),
        ...(coverageUrl && { coverageUrl }),
      },
    }, 201);
  } catch (error) {
    // ... error handling ...
  }
});
```

---

## 5. API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/upload/:project/:version` | POST | Upload storybook (optionally with coverage) |
| `/upload/:project/:version/coverage` | POST | Upload coverage report for existing build |
| `/presigned-url/:project/:version/:filename` | POST | Get presigned URL for upload |

---

## 6. File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/services/firestore/firestore.types.ts` | Modify | Add coverage types |
| `src/services/firestore/firestore.service.ts` | Modify | Add updateBuildCoverage method |
| `src/services/firestore/firestore.node.ts` | Modify | Implement coverage update |
| `src/services/firestore/firestore.worker.ts` | Modify | Implement coverage update |
| `src/app.ts` | Modify | Add coverage upload route, update main upload |

---

## 7. Request Examples

### Upload Storybook with Coverage (multipart)

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@storybook-static.zip" \
  -F "coverage=@coverage-report.json" \
  https://upload.scrymore.com/upload/my-project/v1.0.0
```

### Upload Coverage for Existing Build

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d @coverage-report.json \
  https://upload.scrymore.com/upload/my-project/v1.0.0/coverage
```

### Upload Coverage File

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@coverage-report.json" \
  https://upload.scrymore.com/upload/my-project/v1.0.0/coverage
```

---

## 8. Testing Considerations

1. **Unit Tests:**
   - Coverage type validation
   - Firestore coverage update methods
   - Coverage extraction from full report

2. **Integration Tests:**
   - Upload with coverage
   - Separate coverage upload
   - Coverage data in Firestore

3. **E2E Tests:**
   - Full flow: upload storybook + coverage
   - Verify coverage accessible from dashboard
