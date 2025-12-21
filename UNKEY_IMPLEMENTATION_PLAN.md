# API Key Authentication with Unkey - Implementation Plan

**Project**: Scry Storybook Upload Service  
**Solution**: Unkey (Hosted → Self-hosted migration ready)  
**Priority**: High  
**Estimated Effort**: 1 day (hosted), +4 hours (self-hosted migration)  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Strategy](#architecture-strategy)
3. [Service Abstraction Layer](#service-abstraction-layer)
4. [Phase 1: Hosted Unkey Implementation](#phase-1-hosted-unkey-implementation)
5. [Phase 2: Self-Hosted Migration](#phase-2-self-hosted-migration)
6. [Implementation Steps](#implementation-steps)
7. [Code Examples](#code-examples)
8. [Testing Strategy](#testing-strategy)
9. [Migration Checklist](#migration-checklist)
10. [Cost Analysis](#cost-analysis)

---

## Overview

This plan implements API key authentication using **Unkey Hosted** initially ($25/month), with a clean abstraction layer that enables **zero-code-change migration** to **Unkey Self-Hosted** ($10-20/month) when needed.

### Key Design Principles

✅ **Abstraction Layer**: Unified `ApiKeyService` interface for both implementations  
✅ **Config-Driven**: Switch via environment variable only  
✅ **Zero Code Changes**: Migration = config update + restart  
✅ **Development Speed**: Start fast with hosted  
✅ **Cost Optimization**: Migrate to self-hosted when economical  
✅ **Future-Proof**: Easy to add custom implementation later  

---

## Architecture Strategy

### Multi-Implementation Pattern

```mermaid
graph TB
    subgraph "Application Layer"
        UploadRoute[Upload Routes]
        DashAPI[Dashboard API]
        CLI[CLI Tool]
    end
    
    subgraph "Abstraction Layer"
        Interface[ApiKeyService Interface<br/>Standard Methods]
        Factory[Service Factory<br/>env-based selection]
    end
    
    subgraph "Implementation Layer"
        Hosted[UnkeyHostedService<br/>unkey.dev API]
        SelfHosted[UnkeySelfHostedService<br/>Your Unkey Instance]
        Custom[CustomService<br/>Future Option]
    end
    
    subgraph "External Services"
        UnkeyCloud[Unkey Cloud<br/>app.unkey.dev]
        UnkeyVPS[Self-Hosted Unkey<br/>your-domain.com]
        Firestore[(Firestore)]
    end
    
    UploadRoute --> Interface
    DashAPI --> Interface
    CLI --> Interface
    
    Interface --> Factory
    
    Factory -->|UNKEY_MODE=hosted| Hosted
    Factory -->|UNKEY_MODE=self-hosted| SelfHosted
    Factory -->|UNKEY_MODE=custom| Custom
    
    Hosted --> UnkeyCloud
    SelfHosted --> UnkeyVPS
    Custom --> Firestore
    
    style Interface fill:#4caf50
    style Factory fill:#ff9800
    style Hosted fill:#2196f3
    style SelfHosted fill:#9c27b0
```

### Key Insight

The **same code** works with hosted OR self-hosted Unkey:
- Same API interface
- Same SDK (`@unkey/api`)
- Only difference: Base URL configuration

---

## Service Abstraction Layer

### ApiKeyService Interface

```typescript
// src/services/apikey/apikey.service.ts

/**
 * Unified API Key Service Interface
 * Works with Unkey Hosted, Self-Hosted, or Custom implementation
 */
export interface ApiKeyService {
  /**
   * Create a new API key for a project
   */
  createKey(params: CreateKeyParams): Promise<CreateKeyResult>;
  
  /**
   * Verify an API key
   */
  verifyKey(key: string): Promise<VerifyKeyResult>;
  
  /**
   * List API keys for a project
   */
  listKeys(projectId: string): Promise<ApiKey[]>;
  
  /**
   * Revoke an API key
   */
  revokeKey(keyId: string): Promise<void>;
  
  /**
   * Update API key metadata
   */
  updateKey(keyId: string, updates: UpdateKeyParams): Promise<ApiKey>;
}

export interface CreateKeyParams {
  projectId: string;
  name: string;
  expiresInDays?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateKeyResult {
  id: string;
  key: string;        // Plain text (only shown once)
  prefix: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface VerifyKeyResult {
  valid: boolean;
  projectId?: string;
  keyId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  status: 'active' | 'revoked';
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

export interface UpdateKeyParams {
  name?: string;
  metadata?: Record<string, unknown>;
}
```

### Service Factory

```typescript
// src/services/apikey/apikey.factory.ts

import { UnkeyHostedService } from './unkey-hosted.service';
import { UnkeySelfHostedService } from './unkey-self-hosted.service';
import type { ApiKeyService } from './apikey.service';

/**
 * Factory to create the appropriate ApiKeyService implementation
 * Based on environment configuration
 */
export function createApiKeyService(): ApiKeyService {
  const mode = process.env.UNKEY_MODE || 'hosted';
  
  switch (mode) {
    case 'hosted':
      return new UnkeyHostedService({
        rootKey: process.env.UNKEY_ROOT_KEY!,
        apiId: process.env.UNKEY_API_ID!,
      });
    
    case 'self-hosted':
      return new UnkeySelfHostedService({
        rootKey: process.env.UNKEY_ROOT_KEY!,
        apiId: process.env.UNKEY_API_ID!,
        baseUrl: process.env.UNKEY_BASE_URL!, // Your self-hosted URL
      });
    
    default:
      throw new Error(`Unknown UNKEY_MODE: ${mode}`);
  }
}
```

---

## Phase 1: Hosted Unkey Implementation

### Step 1: Setup Unkey Account (15 minutes)

1. **Sign up**: https://app.unkey.dev
2. **Create API**: Name it "Scry Storybook"
3. **Get credentials**:
   - Root Key: `unkey_xxxxx`
   - API ID: `api_xxxxx`
4. **Configure namespace**: Set prefix to `scry_`

### Step 2: Install Dependencies (5 minutes)

```bash
# Upload Service
cd scry-storybook-upload-service
npm install @unkey/api

# Dashboard
cd scry-developer-dashboard
npm install @unkey/api
```

### Step 3: Configure Environment Variables (10 minutes)

```bash
# scry-storybook-upload-service/.env

# Unkey Configuration
UNKEY_MODE=hosted
UNKEY_ROOT_KEY=unkey_xxxxxxxxxxxxx
UNKEY_API_ID=api_xxxxxxxxxxxxx
# UNKEY_BASE_URL not needed for hosted mode

# Existing env vars
FIREBASE_PROJECT_ID=your-project
# ... other vars
```

```bash
# scry-developer-dashboard/.env.local

# Unkey Configuration (same as above)
UNKEY_MODE=hosted
UNKEY_ROOT_KEY=unkey_xxxxxxxxxxxxx
UNKEY_API_ID=api_xxxxxxxxxxxxx

# Firebase config
NEXT_PUBLIC_FIREBASE_API_KEY=xxx
# ... other vars
```

### Step 4: Implement Hosted Service (45 minutes)

```typescript
// src/services/apikey/unkey-hosted.service.ts

import { Unkey } from '@unkey/api';
import type {
  ApiKeyService,
  CreateKeyParams,
  CreateKeyResult,
  VerifyKeyResult,
  ApiKey,
  UpdateKeyParams,
} from './apikey.service';

export class UnkeyHostedService implements ApiKeyService {
  private client: Unkey;
  private apiId: string;

  constructor(config: { rootKey: string; apiId: string }) {
    this.client = new Unkey({ token: config.rootKey });
    this.apiId = config.apiId;
  }

  async createKey(params: CreateKeyParams): Promise<CreateKeyResult> {
    const { projectId, name, expiresInDays, metadata } = params;
    
    const { result, error } = await this.client.keys.create({
      apiId: this.apiId,
      prefix: `scry_${projectId.substring(0, 8)}`,
      ownerId: projectId,
      name,
      meta: {
        projectId,
        ...metadata,
      },
      expires: expiresInDays
        ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
      ratelimit: {
        type: 'fast',
        limit: 100,
        refillRate: 10,
        refillInterval: 60000, // 1 minute
      },
    });

    if (error) {
      throw new Error(`Failed to create key: ${error.message}`);
    }

    return {
      id: result.keyId,
      key: result.key,
      prefix: `scry_${projectId.substring(0, 8)}_...`,
      createdAt: new Date(),
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    };
  }

  async verifyKey(key: string): Promise<VerifyKeyResult> {
    const { result, error } = await this.client.keys.verify({
      key,
      apiId: this.apiId,
    });

    if (error) {
      return {
        valid: false,
        error: error.message,
      };
    }

    if (!result.valid) {
      return {
        valid: false,
        error: 'Invalid or revoked API key',
      };
    }

    return {
      valid: true,
      projectId: result.ownerId,
      keyId: result.keyId,
      metadata: result.meta as Record<string, unknown>,
    };
  }

  async listKeys(projectId: string): Promise<ApiKey[]> {
    const { result, error } = await this.client.keys.list({
      apiId: this.apiId,
      ownerId: projectId,
    });

    if (error) {
      throw new Error(`Failed to list keys: ${error.message}`);
    }

    return result.keys.map(k => ({
      id: k.id,
      projectId: k.ownerId || projectId,
      name: k.name || 'Unnamed Key',
      prefix: k.start || '',
      status: k.enabled ? 'active' : 'revoked',
      createdAt: new Date(k.createdAt),
      lastUsedAt: k.lastUsed ? new Date(k.lastUsed) : undefined,
      expiresAt: k.expires ? new Date(k.expires) : undefined,
    }));
  }

  async revokeKey(keyId: string): Promise<void> {
    const { error } = await this.client.keys.revoke({
      keyId,
    });

    if (error) {
      throw new Error(`Failed to revoke key: ${error.message}`);
    }
  }

  async updateKey(keyId: string, updates: UpdateKeyParams): Promise<ApiKey> {
    const { result, error } = await this.client.keys.update({
      keyId,
      name: updates.name,
      meta: updates.metadata,
    });

    if (error) {
      throw new Error(`Failed to update key: ${error.message}`);
    }

    return {
      id: result.keyId,
      projectId: result.ownerId || '',
      name: result.name || 'Unnamed Key',
      prefix: result.start || '',
      status: result.enabled ? 'active' : 'revoked',
      createdAt: new Date(result.createdAt),
      lastUsedAt: result.lastUsed ? new Date(result.lastUsed) : undefined,
      expiresAt: result.expires ? new Date(result.expires) : undefined,
    };
  }
}
```

### Step 5: Implement Authentication Middleware (30 minutes)

```typescript
// src/middleware/apikey-auth.middleware.ts

import type { Context, Next } from 'hono';
import type { AppEnv } from '../app';
import { createApiKeyService } from '../services/apikey/apikey.factory';

const apiKeyService = createApiKeyService();

export async function apiKeyAuth(c: Context<AppEnv>, next: Next) {
  const apiKey = c.req.header('x-api-key');

  if (!apiKey) {
    return c.json(
      {
        error: 'Missing API key',
        message: 'Include X-API-Key header with your API key',
      },
      401
    );
  }

  try {
    const verification = await apiKeyService.verifyKey(apiKey);

    if (!verification.valid) {
      return c.json(
        {
          error: 'Invalid API key',
          message: verification.error || 'The provided API key is not valid',
        },
        401
      );
    }

    // Inject authentication context
    c.set('authenticatedProjectId', verification.projectId!);
    c.set('apiKeyId', verification.keyId!);

    await next();
  } catch (error) {
    console.error('API key verification error:', error);
    return c.json(
      {
        error: 'Authentication failed',
        message: 'An error occurred during authentication',
      },
      500
    );
  }
}
```

### Step 6: Apply Middleware to Routes (10 minutes)

```typescript
// src/app.ts

import { apiKeyAuth } from './middleware/apikey-auth.middleware';

// Apply to upload routes
app.use('/upload/*', apiKeyAuth);
app.use('/presigned-url/*', apiKeyAuth);

// Verify project match in route handlers
app.openapi(uploadRoute, async (c) => {
  const { project, version } = c.req.valid('param');
  const authenticatedProjectId = c.get('authenticatedProjectId');

  // Verify project ownership
  if (project !== authenticatedProjectId) {
    return c.json(
      {
        error: 'Project mismatch',
        message: 'This API key does not belong to the specified project',
      },
      403
    );
  }

  // Proceed with upload...
});
```

### Step 7: Dashboard API Routes (1 hour)

```typescript
// scry-developer-dashboard/app/api/projects/[projectId]/api-keys/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createApiKeyService } from '@/lib/services/apikey.factory';
import { verifyAuth } from '@/lib/auth-helpers';

const apiKeyService = createApiKeyService();

// Create API Key
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // Verify user authentication
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, expiresInDays } = await req.json();
  const projectId = params.projectId;

  try {
    const result = await apiKeyService.createKey({
      projectId,
      name,
      expiresInDays,
      metadata: {
        createdBy: user.uid,
        createdByEmail: user.email,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to create API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

// List API Keys
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.projectId;

  try {
    const keys = await apiKeyService.listKeys(projectId);
    return NextResponse.json({ keys });
  } catch (error) {
    console.error('Failed to list API keys:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}
```

```typescript
// Revoke API Key
// scry-developer-dashboard/app/api/projects/[projectId]/api-keys/[keyId]/route.ts

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string; keyId: string } }
) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await apiKeyService.revokeKey(params.keyId);
    return NextResponse.json({ message: 'Key revoked successfully' });
  } catch (error) {
    console.error('Failed to revoke API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}
```

### Step 8: Dashboard UI Component (1 hour)

```typescript
// scry-developer-dashboard/components/project-detail/ProjectApiKeys.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card/Card';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { Label } from '@/components/ui/label/Label';
import { Badge } from '@/components/ui/badge/Badge';
import { CopyIcon, CheckIcon, KeyIcon, AlertTriangleIcon } from 'lucide-react';
import { useApiKeys } from '@/lib/hooks/useApiKeys';

interface ProjectApiKeysProps {
  projectId: string;
}

export function ProjectApiKeys({ projectId }: ProjectApiKeysProps) {
  const { keys, isLoading, createKey, revokeKey } = useApiKeys(projectId);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!keyName.trim()) return;

    setIsCreating(true);
    try {
      const result = await createKey({ name: keyName });
      setNewKey(result.key);
      setKeyName('');
    } catch (error) {
      console.error('Failed to create key:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (confirm('Are you sure? This cannot be undone.')) {
      await revokeKey(keyId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Show-Once New Key Display */}
      {newKey && (
        <Card className="border-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <KeyIcon className="w-5 h-5" />
              API Key Created Successfully
            </CardTitle>
            <CardDescription className="text-green-600">
              Copy this key now - it won't be shown again!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Your API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={newKey}
                  readOnly
                  className="font-mono text-sm bg-white"
                />
                <Button onClick={handleCopy} variant="outline">
                  {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <AlertTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">
                Store this key securely. You won't be able to see it again!
              </p>
            </div>
            <Button onClick={() => setNewKey(null)} variant="outline" className="w-full">
              I've Saved My Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create New Key */}
      <Card>
        <CardHeader>
          <CardTitle>Create New API Key</CardTitle>
          <CardDescription>
            Generate a new API key for deploying Storybook builds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="keyName">Key Name</Label>
            <Input
              id="keyName"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g., Production Deploy Key"
            />
          </div>
          <Button onClick={handleCreate} disabled={isCreating || !keyName.trim()}>
            {isCreating ? 'Creating...' : 'Create API Key'}
          </Button>
        </CardContent>
      </Card>

      {/* Existing Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Manage your project's API keys</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API keys yet. Create one to start deploying.
            </p>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{key.name}</h4>
                      <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                        {key.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{key.prefix}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {new Date(key.createdAt).toLocaleDateString()}
                      {key.lastUsedAt &&
                        ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  {key.status === 'active' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevoke(key.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Phase 2: Self-Hosted Migration

When you're ready to migrate to self-hosted Unkey (to save costs or gain more control), follow these steps.

### Prerequisites for Self-Hosting

1. **VPS or Server**: 1 vCPU, 2GB RAM minimum
2. **Domain**: Subdomain for Unkey (e.g., `unkey.yourdomain.com`)
3. **Database**: PostgreSQL (included in Unkey setup)
4. **Basic DevOps skills**: Docker, Nginx/Caddy

### Self-Hosted Unkey Setup (2-3 hours)

#### Option A: Docker Compose (Recommended)

```bash
# Clone Unkey repository
git clone https://github.com/unkeyed/unkey.git
cd unkey

# Copy environment file
cp .env.example .env

# Configure environment variables
nano .env
```

```bash
# .env for self-hosted Unkey

DATABASE_URL=postgresql://unkey:password@postgres:5432/unkey
PORT=3000
NODE_ENV=production

# Generate secure keys
# Run: openssl rand -base64 32
JWT_SECRET=your-generated-secret
API_SECRET=your-generated-secret
```

```yaml
# docker-compose.yml (simplified)

version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: unkey
      POSTGRES_PASSWORD: your-secure-password
      POSTGRES_DB: unkey
    volumes:
      - postgres_data:/var/lib/postgresql/data

  unkey:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://unkey:your-secure-password@postgres:5432/unkey
      PORT: 3000
    depends_on:
      - postgres

volumes:
  postgres_data:
```

```bash
# Start Unkey
docker-compose up -d

# Check logs
docker-compose logs -f unkey
```

#### Option B: VPS with Nginx

```bash
# On your VPS (Ubuntu/Debian)

# Install dependencies
sudo apt update
sudo apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx

# Clone and setup Unkey (same as above)

# Configure Nginx reverse proxy
sudo nano /etc/nginx/sites-available/unkey
```

```nginx
# /etc/nginx/sites-available/unkey

server {
    listen 80;
    server_name unkey.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site and get SSL
sudo ln -s /etc/nginx/sites-available/unkey /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d unkey.yourdomain.com

# Unkey is now available at https://unkey.yourdomain.com
```

### Migration Steps (30 minutes)

#### Step 1: Create Root Key on Self-Hosted Instance

```bash
# Access your self-hosted Unkey dashboard
# Open: https://unkey.yourdomain.com

# 1. Create account
# 2. Create API workspace
# 3. Generate root key
# 4. Note the API ID
```

#### Step 2: Implement Self-Hosted Service

```typescript
// src/services/apikey/unkey-self-hosted.service.ts

import { Unkey } from '@unkey/api';
import type {
  ApiKeyService,
  CreateKeyParams,
  CreateKeyResult,
  VerifyKeyResult,
  ApiKey,
  UpdateKeyParams,
} from './apikey.service';

/**
 * Self-hosted Unkey implementation
 * Only difference from hosted: custom baseUrl
 */
export class UnkeySelfHostedService implements ApiKeyService {
  private client: Unkey;
  private apiId: string;

  constructor(config: { rootKey: string; apiId: string; baseUrl: string }) {
    // Key difference: custom baseUrl for self-hosted instance
    this.client = new Unkey({
      token: config.rootKey,
      baseUrl: config.baseUrl, // e.g., "https://unkey.yourdomain.com"
    });
    this.apiId = config.apiId;
  }

  // All methods identical to UnkeyHostedService
  // The SDK handles the rest automatically!

  async createKey(params: CreateKeyParams): Promise<CreateKeyResult> {
    // Exact same implementation as hosted version
    const { result, error } = await this.client.keys.create({
      apiId: this.apiId,
      prefix: `scry_${params.projectId.substring(0, 8)}`,
      ownerId: params.projectId,
      name: params.name,
      meta: {
        projectId: params.projectId,
        ...params.metadata,
      },
      expires: params.expiresInDays
        ? Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
      ratelimit: {
        type: 'fast',
        limit: 100,
        refillRate: 10,
        refillInterval: 60000,
      },
    });

    if (error) {
      throw new Error(`Failed to create key: ${error.message}`);
    }

    return {
      id: result.keyId,
      key: result.key,
      prefix: `scry_${params.projectId.substring(0, 8)}_...`,
      createdAt: new Date(),
      expiresAt: params.expiresInDays
        ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    };
  }

  // ... rest of methods identical to hosted version
  // (verifyKey, listKeys, revokeKey, updateKey)
}
```

#### Step 3: Update Environment Variables

**ONLY CHANGE THESE - NO CODE CHANGES NEEDED**

```bash
# Upload Service (.env)
# BEFORE (Hosted)
UNKEY_MODE=hosted
UNKEY_ROOT_KEY=unkey_hosted_xxxxx
UNKEY_API_ID=api_hosted_xxxxx
# UNKEY_BASE_URL not set

# AFTER (Self-Hosted)
UNKEY_MODE=self-hosted
UNKEY_ROOT_KEY=unkey_selfhosted_xxxxx
UNKEY_API_ID=api_selfhosted_xxxxx
UNKEY_BASE_URL=https://unkey.yourdomain.com
```

```bash
# Dashboard (.env.local)
# BEFORE (Hosted)
UNKEY_MODE=hosted
UNKEY_ROOT_KEY=unkey_hosted_xxxxx
UNKEY_API_ID=api_hosted_xxxxx

# AFTER (Self-Hosted)
UNKEY_MODE=self-hosted
UNKEY_ROOT_KEY=unkey_selfhosted_xxxxx
UNKEY_API_ID=api_selfhosted_xxxxx
UNKEY_BASE_URL=https://unkey.yourdomain.com
```

#### Step 4: Migrate Existing API Keys (Optional)

```typescript
// scripts/migrate-keys.ts

import { UnkeyHostedService } from './src/services/apikey/unkey-hosted.service';
import { UnkeySelfHostedService } from './src/services/apikey/unkey-self-hosted.service';

async function migrateKeys() {
  const hosted = new UnkeyHostedService({
    rootKey: process.env.OLD_UNKEY_ROOT_KEY!,
    apiId: process.env.OLD_UNKEY_API_ID!,
  });

  const selfHosted = new UnkeySelfHostedService({
    rootKey: process.env.NEW_UNKEY_ROOT_KEY!,
    apiId: process.env.NEW_UNKEY_API_ID!,
    baseUrl: process.env.UNKEY_BASE_URL!,
  });

  // Get all projects
  const projects = await getProjects(); // Your Firestore query

  for (const project of projects) {
    console.log(`Migrating keys for project: ${project.id}`);
    
    // Cannot migrate existing keys (encrypted)
    // Instead, notify project owners to regenerate keys
    console.log(`- Notify owner to regenerate API key`);
    
    // Or auto-create new key and email it
    const newKey = await selfHosted.createKey({
      projectId: project.id,
      name: 'Migrated Key',
      metadata: {
        migratedFrom: 'hosted',
        migratedAt: new Date().toISOString(),
      },
    });
    
    await emailKeyToOwner(project.ownerId, newKey.key);
  }
}
```

#### Step 5: Deploy and Test

```bash
# 1. Update environment variables in production
vercel env add UNKEY_MODE
vercel env add UNKEY_BASE_URL
vercel env add UNKEY_ROOT_KEY
vercel env add UNKEY_API_ID

# 2. Deploy dashboard
cd scry-developer-dashboard
npm run build
vercel deploy --prod

# 3. Deploy upload service
cd scry-storybook-upload-service
wrangler deploy

# 4. Test upload with new key
curl -X POST https://upload.scrymore.com/upload/test-project/v1.0.0 \
  -H "X-API-Key: scry_test_xxxxx" \
  -F "file=@storybook.zip"
```

#### Step 6: Cleanup (Optional)

```bash
# After migration is confirmed working:
# 1. Cancel Unkey hosted subscription
# 2. Delete old keys from hosted instance
# 3. Update documentation
```

---

## Complete Code Structure

```
scry-storybook-upload-service/
├── src/
│   ├── services/
│   │   └── apikey/
│   │       ├── apikey.service.ts          # Interface definition
│   │       ├── apikey.factory.ts          # Service factory (env-based)
│   │       ├── unkey-hosted.service.ts    # Hosted implementation
│   │       └── unkey-self-hosted.service.ts # Self-hosted implementation
│   ├── middleware/
│   │   └── apikey-auth.middleware.ts      # Auth middleware (uses factory)
│   └── app.ts                             # Apply middleware to routes
├── .env.example
└── package.json

scry-developer-dashboard/
├── lib/
│   ├── services/
│   │   └── apikey/
│   │       ├── apikey.service.ts          # Same interface
│   │       ├── apikey.factory.ts          # Same factory
│   │       ├── unkey-hosted.service.ts    # Same hosted impl
│   │       └── unkey-self-hosted.service.ts # Same self-hosted impl
│   └── hooks/
│       └── useApiKeys.ts                  # React hook (uses factory)
├── app/
│   └── api/
│       └── projects/
│           └── [projectId]/
│               └── api-keys/
│                   ├── route.ts           # Create/List API
│                   └── [keyId]/
│                       └── route.ts       # Revoke API
├── components/
│   └── project-detail/
│       ├── ProjectApiKeys.tsx            # UI component
│       └── ProjectSettings.tsx           # Include API keys section
└── .env.local.example
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/apikey.service.test.ts

describe('ApiKeyService Factory', () => {
  it('should create hosted service when UNKEY_MODE=hosted', () => {
    process.env.UNKEY_MODE = 'hosted';
    const service = createApiKeyService();
    expect(service).toBeInstanceOf(UnkeyHostedService);
  });

  it('should create self-hosted service when UNKEY_MODE=self-hosted', () => {
    process.env.UNKEY_MODE = 'self-hosted';
    process.env.UNKEY_BASE_URL = 'https://unkey.example.com';
    const service = createApiKeyService();
    expect(service).toBeInstanceOf(UnkeySelfHostedService);
  });
});

describe('Unkey Hosted Service', () => {
  let service: UnkeyHostedService;

  beforeEach(() => {
    service = new UnkeyHostedService({
      rootKey: process.env.UNKEY_ROOT_KEY!,
      apiId: process.env.UNKEY_API_ID!,
    });
  });

  it('should create API key', async () => {
    const result = await service.createKey({
      projectId: 'test-project',
      name: 'Test Key',
    });

    expect(result.id).toBeDefined();
    expect(result.key).toMatch(/^scry_test/);
    expect(result.prefix).toBe('scry_test_...');
  });

  it('should verify valid API key', async () => {
    const key = await service.createKey({
      projectId: 'test-project',
      name: 'Test Key',
    });

    const verification = await service.verifyKey(key.key);

    expect(verification.valid).toBe(true);
    expect(verification.projectId).toBe('test-project');
  });

  it('should reject invalid API key', async () => {
    const verification = await service.verifyKey('invalid_key');

    expect(verification.valid).toBe(false);
    expect(verification.error).toBeDefined();
  });
});
```

### Integration Tests

```typescript
// e2e/apikey-auth.test.ts

describe('API Key Authentication E2E', () => {
  let projectId: string;
  let apiKey: string;

  beforeAll(async () => {
    // Create test project
    projectId = 'test-project-' + Date.now();

    // Create API key via dashboard API
    const response =  await fetch(`${DASHBOARD_URL}/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({ name: 'E2E Test Key' }),
    });

    const data = await response.json();
    apiKey = data.key;
  });

  it('should allow upload with valid API key', async () => {
    const response = await fetch(`${UPLOAD_URL}/upload/${projectId}/v1.0.0`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/zip',
      },
      body: testZipBuffer,
    });

    expect(response.status).toBe(201);
  });

  it('should reject upload without API key', async () => {
    const response = await fetch(`${UPLOAD_URL}/upload/${projectId}/v1.0.0`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
      },
      body: testZipBuffer,
    });

    expect(response.status).toBe(401);
  });

  it('should reject upload with invalid API key', async () => {
    const response = await fetch(`${UPLOAD_URL}/upload/${projectId}/v1.0.0`, {
      method: 'POST',
      headers: {
        'X-API-Key': 'invalid_key_12345',
        'Content-Type': 'application/zip',
      },
      body: testZipBuffer,
    });

    expect(response.status).toBe(401);
  });

  it('should reject upload with revoked API key', async () => {
    // Revoke the key
    await fetch(`${DASHBOARD_URL}/api/projects/${projectId}/api-keys/${keyId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
    });

    // Try to use revoked key
    const response = await fetch(`${UPLOAD_URL}/upload/${projectId}/v1.0.0`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/zip',
      },
      body: testZipBuffer,
    });

    expect(response.status).toBe(401);
  });
});
```

---

## Migration Checklist

> ⚠️ **CRITICAL WARNING**: Migration requires **Key Regeneration**.
> You cannot export raw keys from Unkey Hosted. When you switch to Self-Hosted, **ALL USERS must generate NEW API keys**.
> Plan this as a "Hard Cutover" event.

### Pre-Migration

- [ ] Set up self-hosted Unkey instance
- [ ] Configure domain and SSL certificate
- [ ] Test self-hosted instance is accessible
- [ ] Create root key on self-hosted instance
- [ ] Create API workspace
- [ ] Document new credentials
- [ ] Test key creation on self-hosted instance

### Migration Day

- [ ] Announce maintenance window to users
- [ ] Update environment variables (staging first)
- [ ] Deploy to staging environment
- [ ] Test API key creation on staging
- [ ] Test API key verification on staging
- [ ] Test full upload flow on staging
- [ ] Update environment variables (production)
- [ ] Deploy to production
- [ ] Monitor logs for errors
- [ ] Test production uploads
- [ ] Notify users migration is complete

### Post-Migration

- [ ] Monitor API key usage
- [ ] Check self-hosted Unkey performance
- [ ] Verify all features working
- [ ] Update internal documentation
- [ ] Cancel hosted Unkey subscription
- [ ] Set up backup for self-hosted instance
- [ ] Set up monitoring/alerts for self-hosted instance

---

## Cost Analysis

### Hosted Unkey

**Months 1-X** (until migration):
- Monthly: $25
- Includes: 1,000 keys, 10M verifications/month
- Your usage: 3,000 projects, 1.8M verifications/month ✅ Within limits

### Self-Hosted Unkey

**After migration**:
- VPS: $12-20/month (Digital Ocean, Hetzner, etc.)
- Database: $0 (included with VPS)
- Domain: $0 (use subdomain)
- SSL: $0 (Let's Encrypt)
- **Total: $12-20/month**

### Savings

- **Per month**: $5-13 saved
- **Per year**: $60-156 saved
- **3 years**: $180-468 saved

### Cost Comparison Timeline

| Month | Hosted Cost | Self-Hosted Cost | Savings |
|-------|-------------|------------------|---------|
| 1-3   | $25/month   | N/A              | Start hosted |
| 4     | $25         | $15              | -$10    |
| 5-12  | $25/month   | $15/month        | -$10/month |
| Year 1| $300        | $180             | -$120   |
| Year 2| $300        | $180             | -$120   |
| Year 3| $300        | $180             | -$120   |

### Break-Even Analysis

- **Migration effort**: 4 hours @ $100/hour = $400
- **Monthly savings**: $10/month
- **Break-even**: 40 months (3.3 years)

**Recommendation**: Start with hosted, migrate to self-hosted after you validate the solution and have time for DevOps setup.

---

## Summary

### Phase 1: Hosted (Start Here)

**Time**: 1 day  
**Cost**: $25/month  
**Benefit**:
- ✅ Fast implementation
- ✅ Zero infrastructure management
- ✅ Professional features
- ✅ Validate solution quickly

### Phase 2: Self-Hosted (Migrate Later)

**Time**: +4 hours  
**Cost**: $15/month  
**Benefit**:
- ✅ Lower ongoing costs
- ✅ Complete control
- ✅ No vendor lock-in
- ✅ Unlimited scale

### Key Success Factors

1. **Abstraction layer** makes migration seamless
2. **Only config changes** needed to switch
3. **Same SDK** for both modes
4. **Zero code changes** during migration
5. **Gradual rollout** possible

---

**Next Steps**:
1. Review this plan
2. Set up Unkey hosted account (15 min)
3. Implement Phase 1 (1 day)
4. Test thoroughly
5. Deploy to production
6. Plan Phase 2 migration (later)

---

**Document Version**: 1.0  
**Created**: 2025-11-21  
**Recommended Path**: Hosted → Self-hosted  
**Status**: Ready for Implementation
