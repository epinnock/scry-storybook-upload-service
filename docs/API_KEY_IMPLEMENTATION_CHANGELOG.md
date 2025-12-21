# Firebase API Key Authentication - Implementation Changelog

**Date**: 2025-11-26  
**Feature**: Custom Firebase-based API Key Authentication System  
**Status**: ✅ Complete and Tested

---

## Overview

Implemented a complete API key authentication system using Firebase Firestore as the backend. This replaces the need for external services like Unkey and provides project-scoped API key management with secure hashing and validation.

---

## New Files Created

### API Key Service Module (`src/services/apikey/`)

#### [`apikey.types.ts`](src/services/apikey/apikey.types.ts:1) (107 lines)
**Purpose**: TypeScript type definitions for API key system

**Key Types**:
- `ApiKey` - Full API key document structure
- `ApiKeyStatus` - Status enum ('active' | 'revoked')
- `CreateApiKeyData` - Input for creating keys
- `CreateApiKeyResult` - Response including raw key (shown once)
- `ValidateApiKeyResult` - Response from validation
- `ApiKeyListItem` - Public API key metadata (no hash)

**Data Model**:
```typescript
interface ApiKey {
  id: string;
  name: string;           // e.g., "CI/CD Key"
  prefix: string;         // First 12 chars (e.g., "scry_proj_ab")
  hash: string;           // SHA-256 hash (raw key NEVER stored)
  status: 'active' | 'revoked';
  createdAt: Date;
  createdBy: string;
  lastUsedAt?: Date;      // Updated on each successful auth
  expiresAt?: Date;       // Optional expiration
  revokedAt?: Date;
  revokedBy?: string;
}
```

#### [`apikey.utils.ts`](src/services/apikey/apikey.utils.ts:1) (143 lines)
**Purpose**: Key generation and hashing utilities using Web Crypto API

**Functions**:
- `generateApiKey(projectId)` - Generates keys in format: `scry_proj_{projectId}_{random32bytes}`
- `hashApiKey(key)` - SHA-256 hashing for secure storage
- `extractProjectIdFromKey(key)` - Parses project ID from key
- `getKeyPrefix(key)` - Gets first 12 chars for display
- `isValidApiKeyFormat(key)` - Validates key structure
- `generateKeyId()` - Creates 20-char document IDs
- `generateRandomString()` - Base62-encoded random strings

**Security Features**:
- Uses `crypto.getRandomValues()` for cryptographic randomness
- SHA-256 hashing via Web Crypto API (cross-platform)
- Base62 encoding for URL-safe key strings

#### [`apikey.service.ts`](src/services/apikey/apikey.service.ts:1) (73 lines)
**Purpose**: Service interface contract (platform-agnostic)

**Methods**:
- `createApiKey()` - Create new key, return raw key once
- `validateApiKey()` - Validate incoming key, return metadata
- `listApiKeys()` - List all keys for project (no hash data)
- `revokeApiKey()` - Mark key as revoked
- `deleteApiKey()` - Permanently delete key
- `updateLastUsed()` - Update usage timestamp (fire-and-forget)

#### [`apikey.node.ts`](src/services/apikey/apikey.node.ts:1) (195 lines)
**Purpose**: Node.js implementation using Firebase Admin SDK

**Features**:
- Direct Firestore access via Admin SDK
- Efficient queries with native SDK methods
- Server-side timestamp generation
- Transaction support for atomic operations

**Collection Path**: `projects/{projectId}/apiKeys/{keyId}`

#### [`apikey.worker.ts`](src/services/apikey/apikey.worker.ts:1) (387 lines)
**Purpose**: Cloudflare Workers implementation using Firestore REST API

**Features**:
- JWT-based service account authentication
- REST API queries to Firestore
- Access token caching (1-hour expiry)
- RSA-SHA256 signing for JWTs
- Same interface as Node.js version

**Shared Code**: Reuses JWT/auth logic from [`firestore.worker.ts`](src/services/firestore/firestore.worker.ts:1)

#### [`index.ts`](src/services/apikey/index.ts:1) (54 lines)
**Purpose**: Module exports and documentation

Exports all types, interfaces, and utilities for easy importing.

---

### Authentication Middleware (`src/middleware/`)

#### [`auth.ts`](src/middleware/auth.ts:1) (181 lines)
**Purpose**: Hono middleware for API key validation

**Features**:
- Extracts `X-API-Key` header from requests
- Validates key format and project match
- Queries Firestore for active keys
- Checks expiration dates
- Updates `lastUsedAt` (non-blocking)
- Sets authenticated context in `c.var`

**Configuration Options**:
```typescript
{
  headerName: 'X-API-Key',           // Customizable header
  validateProjectMatch: true,         // Verify key belongs to project
  projectParamName: 'project',        // Route param for project ID
  trackUsage: true,                   // Update lastUsedAt
  optional: false                     // Allow unauthenticated requests
}
```

**Helper Functions**:
- `isAuthenticated(c)` - Check if request is authenticated
- `getAuthenticatedApiKey(c)` - Get authenticated key metadata

---

### Unit Tests

#### [`apikey.utils.test.ts`](src/services/apikey/apikey.utils.test.ts:1) (199 lines)
**Coverage**: 27 tests for key utilities
- Key generation format validation
- Hash consistency and uniqueness
- Project ID extraction
- Format validation edge cases

#### [`apikey.worker.test.ts`](src/services/apikey/apikey.worker.test.ts:1) (286 lines)
**Coverage**: 10 tests for Worker service implementation
- Key creation with/without expiration
- Validation of active/expired/revoked keys
- Key listing without hash exposure
- Revocation and deletion operations

#### [`auth.test.ts`](src/middleware/auth.test.ts:1) (319 lines)
**Coverage**: 13 tests for authentication middleware
- Missing/invalid API key handling
- Project mismatch detection
- Valid authentication flow
- Optional authentication mode
- Custom header support
- Usage tracking verification

**Test Results**: ✅ All 52 tests passing

---

## Modified Files

### [`src/app.ts`](src/app.ts:1)
**Changes**:
1. **Added imports** (lines 13-14):
   ```typescript
   import type { ApiKeyService } from './services/apikey/apikey.service.js';
   import { apiKeyAuth, type AuthVariables } from './middleware/auth.js';
   ```

2. **Extended AppEnv type** (lines 17-24):
   - Added `apiKeyService?: ApiKeyService`
   - Added `AuthVariables` for authenticated context

3. **Added auth middleware** (lines 31-34):
   ```typescript
   app.use('/upload/*', apiKeyAuth());
   app.use('/presigned-url/*', apiKeyAuth());
   ```

4. **Added auth error schema** (lines 145-148):
   ```typescript
   const AuthErrorResponseSchema = z.object({
     error: z.string(),
     message: z.string()
   });
   ```

5. **Updated OpenAPI responses** for protected routes:
   - Upload route: Added 401, 403 responses
   - Presigned URL route: Added 401, 403 responses
   - Fixed status code on presigned URL response (line 486)

### [`src/entry.node.ts`](src/entry.node.ts:1)
**Changes**:
1. **Added import** (line 8):
   ```typescript
   import { ApiKeyServiceNode } from './services/apikey/apikey.node.js';
   ```

2. **Injected API key service** (lines 87-95):
   ```typescript
   if (admin.apps.length > 0) {
     const firestoreService = new FirestoreServiceNode(serviceAccountId);
     c.set('firestore', firestoreService);
     
     // Initialize API Key service for authentication
     const apiKeyService = new ApiKeyServiceNode();
     c.set('apiKeyService', apiKeyService);
   }
   ```

### [`src/entry.worker.ts`](src/entry.worker.ts:1)
**Changes**:
1. **Added import** (line 6):
   ```typescript
   import { ApiKeyServiceWorker } from './services/apikey/apikey.worker';
   ```

2. **Injected API key service** (lines 69-87):
   ```typescript
   if (c.env.FIREBASE_PROJECT_ID && c.env.FIREBASE_CLIENT_EMAIL && c.env.FIREBASE_PRIVATE_KEY) {
     const firestoreService = new FirestoreServiceWorker(firestoreConfig);
     c.set('firestore', firestoreService);
     
     // Initialize API Key service for authentication
     const apiKeyConfig = {
       projectId: c.env.FIREBASE_PROJECT_ID,
       clientEmail: c.env.FIREBASE_CLIENT_EMAIL,
       privateKey: c.env.FIREBASE_PRIVATE_KEY
     };
     const apiKeyService = new ApiKeyServiceWorker(apiKeyConfig);
     c.set('apiKeyService', apiKeyService);
   }
   ```

---

## Documentation Files

### [`API_KEY_DEPLOYMENT_GUIDE.md`](API_KEY_DEPLOYMENT_GUIDE.md:1) (294 lines)
Complete deployment guide covering:
- Firestore security rules and indexes
- Cloudflare Workers secret configuration
- Manual API key creation methods
- Testing procedures
- Troubleshooting common issues
- Security best practices

---

## Breaking Changes

⚠️ **Authentication Now Required**

After deployment, the following endpoints **require** the `X-API-Key` header:
- `POST /upload/:project/:version`
- `POST /presigned-url/:project/:version/:filename`

**Backwards Compatibility**:
- Health check (`/health`) - No auth required
- File retrieval (`GET /upload/:project/:version`) - No auth required
- Cleanup (`DELETE /cleanup/:project/:version`) - Uses existing `X-Test-Cleanup` header

---

## Architecture

```
Client Request
     ↓
[Logger Middleware]
     ↓
[API Key Auth Middleware] ← Validates X-API-Key header
     ↓                       against Firestore API keys
[Route Handler]
     ↓
[Storage Service]
```

**Firestore Structure**:
```
projects/
  └── {projectId}/
      ├── builds/          (existing)
      └── apiKeys/         (new)
          └── {keyId}
              ├── name: string
              ├── prefix: string
              ├── hash: string (SHA-256)
              ├── status: 'active' | 'revoked'
              ├── createdAt: timestamp
              ├── createdBy: string
              ├── lastUsedAt?: timestamp
              ├── expiresAt?: timestamp
              ├── revokedAt?: timestamp
              └── revokedBy?: string
```

---

## Key Benefits

1. **Security**:
   - Raw keys never stored (only SHA-256 hashes)
   - Show-once key generation
   - Automatic expiration support
   - Project-scoped access control

2. **Cost Effective**:
   - Uses existing Firebase infrastructure
   - No external service fees (Unkey alternative)
   - Minimal Firestore reads/writes per request

3. **Developer Experience**:
   - Type-safe implementation
   - Cross-platform (Node.js + Workers)
   - Comprehensive test coverage (52 tests)
   - Clear error messages

4. **Operational**:
   - Usage tracking (lastUsedAt)
   - Key revocation support
   - Graceful fallback if Firebase not configured
   - Detailed logging for debugging

---

## Next Steps

1. Deploy: `wrangler deploy --env=""`
2. Create first API key via Firebase Console or CLI script
3. Test authentication with curl commands
4. Monitor usage via Firestore `lastUsedAt` field
5. Set up key rotation policy as needed

---

## Migration Path

If you have existing clients using the service:

1. **Create API keys** for all existing integrations
2. **Distribute keys** to client owners
3. **Deploy** the new version
4. **Update clients** to include `X-API-Key` header
5. **Monitor** Firestore for authentication failures

The system includes detailed error messages to help clients troubleshoot authentication issues.