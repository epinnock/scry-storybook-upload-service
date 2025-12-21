# API Key Authentication - Deployment Guide

This guide covers the steps needed to deploy the Firebase API key authentication system.

## Table of Contents

1. [Firebase Configuration](#firebase-configuration)
2. [Cloudflare Workers Configuration](#cloudflare-workers-configuration)
3. [Creating API Keys](#creating-api-keys)
4. [Testing the Deployment](#testing-the-deployment)

---

## Firebase Configuration

### 1. Firestore Security Rules

Update your Firestore security rules to allow the upload service to read/write API keys. Add these rules to your `firestore.rules` file:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // API Keys collection - project scoped
    match /projects/{projectId}/apiKeys/{keyId} {
      // Allow service account to read/write (for upload service)
      // Service account authentication bypasses these rules, but 
      // we define them for completeness
      
      // Dashboard users with admin role can manage keys
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/projects/$(projectId)/members/$(request.auth.uid)).data.role == 'admin';
      
      // Project owners can manage keys
      allow read, write: if request.auth != null &&
        get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId == request.auth.uid;
    }
    
    // Existing rules for builds, etc.
    match /projects/{projectId}/builds/{buildId} {
      // ... your existing rules
    }
  }
}
```

Deploy the rules:
```bash
firebase deploy --only firestore:rules
```

### 2. Firestore Indexes

Create a composite index for efficient API key lookups. Create or update `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "apiKeys",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "hash", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "apiKeys",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

Deploy the indexes:
```bash
firebase deploy --only firestore:indexes
```

**Note**: Index creation can take several minutes. You can monitor progress in the Firebase Console under Firestore → Indexes.

### 3. Verify Service Account Permissions

Ensure your Firebase service account has the necessary permissions:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Download or note your service account credentials
5. The service account should have the `Firebase Admin SDK Administrator Service Agent` role

---

## Cloudflare Workers Configuration

### 1. Set Required Secrets

The upload service needs Firebase credentials as secrets. Set them using Wrangler:

```bash
# Firebase Project ID
wrangler secret put FIREBASE_PROJECT_ID
# Enter your Firebase project ID when prompted

# Firebase Client Email (from service account JSON)
wrangler secret put FIREBASE_CLIENT_EMAIL
# Enter the client_email from your service account JSON

# Firebase Private Key (from service account JSON)
wrangler secret put FIREBASE_PRIVATE_KEY
# Enter the private_key from your service account JSON
# Note: Include the full key including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----
```

### 2. Update wrangler.toml (if needed)

Ensure your `wrangler.toml` has the required environment variables listed:

```toml
[vars]
# Optional: Custom service account ID for build records
FIRESTORE_SERVICE_ACCOUNT_ID = "upload-service"

# Note: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY
# should be set as secrets, not vars
```

### 3. Deploy the Worker

```bash
# Deploy to production
wrangler deploy

# Or deploy to a specific environment
wrangler deploy --env staging
```

---

## Creating API Keys

Since API keys are managed through Firestore, you have two options for creating them:

### Option A: Firebase Console (Manual)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Firestore Database**
3. Navigate to `projects/{your-project-id}/apiKeys`
4. Click **Add document**
5. Use the following structure:

```json
{
  "name": "CI/CD Key",
  "prefix": "scry_proj_yo",  // First 12 chars of raw key
  "hash": "<SHA-256 hash of raw key>",
  "status": "active",
  "createdAt": "<Timestamp>",
  "createdBy": "manual"
}
```

To generate a key and hash:
```javascript
// Run this in Node.js to generate a key
const crypto = require('crypto');

const projectId = 'your-project-id';
const randomPart = crypto.randomBytes(32).toString('base64url');
const rawKey = `scry_proj_${projectId}_${randomPart}`;
const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

console.log('Raw Key (save this!):', rawKey);
console.log('Hash (store in Firestore):', hash);
console.log('Prefix:', rawKey.slice(0, 12));
```

### Option B: Dashboard API (Recommended)

If you have a dashboard/management API, implement endpoints to manage keys:

```typescript
// POST /api/projects/:projectId/api-keys
// Creates a new API key and returns the raw key (once)

// GET /api/projects/:projectId/api-keys
// Lists all API keys (without hash or raw key)

// DELETE /api/projects/:projectId/api-keys/:keyId
// Revokes an API key
```

### Option C: CLI Script

Create a simple CLI script to manage keys:

```bash
#!/bin/bash
# create-api-key.sh

PROJECT_ID=$1
KEY_NAME=$2

# Generate key
RANDOM_PART=$(openssl rand -base64 32 | tr -d '/+=' | head -c 43)
RAW_KEY="scry_proj_${PROJECT_ID}_${RANDOM_PART}"
HASH=$(echo -n "$RAW_KEY" | sha256sum | cut -d' ' -f1)
PREFIX="${RAW_KEY:0:12}"

echo "Creating API key for project: $PROJECT_ID"
echo "Raw Key: $RAW_KEY"
echo ""
echo "Save this key securely - it will not be shown again!"
echo ""

# Store in Firestore using gcloud
gcloud firestore documents create \
  "projects/YOUR_FIREBASE_PROJECT/databases/(default)/documents/projects/${PROJECT_ID}/apiKeys/$(cat /proc/sys/kernel/random/uuid)" \
  --data="{
    \"name\": {\"stringValue\": \"${KEY_NAME}\"},
    \"prefix\": {\"stringValue\": \"${PREFIX}\"},
    \"hash\": {\"stringValue\": \"${HASH}\"},
    \"status\": {\"stringValue\": \"active\"},
    \"createdAt\": {\"timestampValue\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"},
    \"createdBy\": {\"stringValue\": \"cli\"}
  }"
```

---

## Testing the Deployment

### 1. Health Check (No Auth Required)

```bash
curl https://your-worker.workers.dev/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-01-01T00:00:00.000Z"}
```

### 2. Upload Without API Key (Should Fail)

```bash
curl -X POST \
  https://your-worker.workers.dev/upload/my-project/v1.0.0 \
  -F "file=@storybook.zip"
```

Expected response:
```json
{"error":"Authentication required","message":"Missing X-API-Key header"}
```

### 3. Upload With Invalid API Key (Should Fail)

```bash
curl -X POST \
  -H "X-API-Key: invalid_key" \
  https://your-worker.workers.dev/upload/my-project/v1.0.0 \
  -F "file=@storybook.zip"
```

Expected response:
```json
{"error":"Invalid API key format","message":"The provided API key has an invalid format"}
```

### 4. Upload With Valid API Key (Should Succeed)

```bash
curl -X POST \
  -H "X-API-Key: scry_proj_my-project_your-actual-raw-key" \
  https://your-worker.workers.dev/upload/my-project/v1.0.0 \
  -F "file=@storybook.zip"
```

Expected response:
```json
{
  "success": true,
  "message": "Upload successful",
  "key": "my-project/v1.0.0/storybook.zip",
  "data": {
    "url": "https://...",
    "path": "my-project/v1.0.0/storybook.zip",
    "buildId": "...",
    "buildNumber": 1
  }
}
```

---

## Troubleshooting

### "API key service not configured - skipping authentication"

This warning appears if Firebase credentials are not set. Check:
- All three secrets are set: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- The private key includes the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- There are no extra spaces or line breaks in the secrets

### "Invalid or revoked API key"

- Verify the key exists in Firestore at `projects/{projectId}/apiKeys`
- Check the key's `status` is `"active"`
- Verify the hash was calculated correctly
- Check if the key has expired (`expiresAt` field)

### "Project mismatch"

The project ID in the API key doesn't match the project in the URL:
- API key format: `scry_proj_{projectId}_{random}`
- URL format: `/upload/{projectId}/{version}`
- Both `{projectId}` values must match

### Index Errors

If you see Firestore index errors, wait for indexes to build (check Firebase Console → Firestore → Indexes).

---

## Security Best Practices

1. **Never log raw API keys** - Only log prefixes for debugging
2. **Rotate keys periodically** - Create new keys and revoke old ones
3. **Use short expiration** - Set `expiresAt` for temporary keys
4. **Monitor usage** - Check `lastUsedAt` to identify unused keys
5. **Revoke immediately** - If a key is compromised, revoke it immediately