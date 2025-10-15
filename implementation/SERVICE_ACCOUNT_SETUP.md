# Service Account Setup Guide

This guide explains how to configure Firebase service account authentication for both Node.js and Cloudflare Workers environments using your `serviceAccount.json` file.

## Service Account File Structure

Your `serviceAccount.json` should look like this:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

## Node.js Environment Setup

### Option 1: Direct File Path (Development)

For local development, you can use the service account file directly:

1. **Place the file in your project** (ensure it's gitignored):
   ```bash
   # Add to .gitignore
   echo "serviceAccount.json" >> .gitignore
   ```

2. **Update `.env` file**:
   ```bash
   # .env
   PORT=3000
   
   # R2 Storage Configuration
   R2_ACCOUNT_ID="your-account-id"
   R2_S3_ACCESS_KEY_ID="your-access-key-id"
   R2_S3_SECRET_ACCESS_KEY="your-secret-access-key"
   R2_BUCKET_NAME="your-bucket-name"
   
   # Firebase Configuration
   GOOGLE_APPLICATION_CREDENTIALS="./serviceAccount.json"
   FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"
   ```

3. **Initialize Firebase Admin** in [`entry.node.ts`](src/entry.node.ts:1):
   ```typescript
   import admin from 'firebase-admin';
   
   // Initialize Firebase Admin
   if (!admin.apps.length) {
     admin.initializeApp({
       credential: admin.credential.applicationDefault()
     });
   }
   ```

### Option 2: Environment Variables (Production)

For production deployments (Docker, VPS, etc.), extract credentials to environment variables:

1. **Update `.env` file**:
   ```bash
   # .env
   PORT=3000
   
   # R2 Storage Configuration
   R2_ACCOUNT_ID="your-account-id"
   R2_S3_ACCESS_KEY_ID="your-access-key-id"
   R2_S3_SECRET_ACCESS_KEY="your-secret-access-key"
   R2_BUCKET_NAME="your-bucket-name"
   
   # Firebase Configuration (from serviceAccount.json)
   FIREBASE_PROJECT_ID="your-project-id"
   FIREBASE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"
   ```

2. **Initialize Firebase Admin** in [`entry.node.ts`](src/entry.node.ts:1):
   ```typescript
   import admin from 'firebase-admin';
   
   // Initialize Firebase Admin with explicit credentials
   if (!admin.apps.length) {
     admin.initializeApp({
       credential: admin.credential.cert({
         projectId: process.env.FIREBASE_PROJECT_ID,
         clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
         privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
       })
     });
   }
   ```

## Cloudflare Workers Environment Setup

Cloudflare Workers don't have file system access, so you must use environment variables/secrets.

### Step 1: Extract Credentials from serviceAccount.json

Create a helper script to extract the necessary credentials:

```bash
# scripts/extract-firebase-credentials.sh
#!/bin/bash

SERVICE_ACCOUNT_FILE="serviceAccount.json"

if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
  echo "Error: serviceAccount.json not found"
  exit 1
fi

echo "Extracting Firebase credentials from $SERVICE_ACCOUNT_FILE..."
echo ""

# Extract values using jq (install with: brew install jq or apt-get install jq)
PROJECT_ID=$(jq -r '.project_id' $SERVICE_ACCOUNT_FILE)
CLIENT_EMAIL=$(jq -r '.client_email' $SERVICE_ACCOUNT_FILE)
PRIVATE_KEY=$(jq -r '.private_key' $SERVICE_ACCOUNT_FILE)

echo "======================================"
echo "Copy these values to set Wrangler secrets:"
echo "======================================"
echo ""
echo "FIREBASE_PROJECT_ID:"
echo "$PROJECT_ID"
echo ""
echo "FIREBASE_CLIENT_EMAIL:"
echo "$CLIENT_EMAIL"
echo ""
echo "FIREBASE_PRIVATE_KEY:"
echo "$PRIVATE_KEY"
echo ""
echo "======================================"
echo "Run these commands to set secrets:"
echo "======================================"
echo "wrangler secret put FIREBASE_PROJECT_ID"
echo "wrangler secret put FIREBASE_CLIENT_EMAIL"
echo "wrangler secret put FIREBASE_PRIVATE_KEY"
echo "wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID"
```

### Step 2: Set Wrangler Secrets

1. **Make script executable**:
   ```bash
   chmod +x scripts/extract-firebase-credentials.sh
   ```

2. **Run the extraction script**:
   ```bash
   ./scripts/extract-firebase-credentials.sh
   ```

3. **Set each secret** (paste the value when prompted):
   ```bash
   wrangler secret put FIREBASE_PROJECT_ID
   # Paste: your-project-id
   
   wrangler secret put FIREBASE_CLIENT_EMAIL
   # Paste: service-account@your-project.iam.gserviceaccount.com
   
   wrangler secret put FIREBASE_PRIVATE_KEY
   # Paste: -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   
   wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID
   # Enter: upload-service (or your preferred service identifier)
   ```

### Step 3: Configure Local Development (.dev.vars)

For local Worker development with `wrangler dev`:

1. **Update `.dev.vars`** file:
   ```bash
   # .dev.vars
   R2_ACCOUNT_ID="your-account-id"
   R2_S3_ACCESS_KEY_ID="your-access-key-id"
   R2_S3_SECRET_ACCESS_KEY="your-secret-access-key"
   R2_BUCKET_NAME="your-staging-bucket"
   
   # Firebase Configuration (from serviceAccount.json)
   FIREBASE_PROJECT_ID="your-project-id"
   FIREBASE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"
   ```

2. **Ensure `.dev.vars` is gitignored**:
   ```bash
   echo ".dev.vars" >> .gitignore
   ```

### Step 4: Update wrangler.toml

Update [`wrangler.toml`](wrangler.toml:1) to reference the bindings:

```toml
name = "storybook-deployment-service"
main = "dist/entry.worker.js"
compatibility_date = "2024-01-01"

# Environment variables that are NOT secret (optional)
[vars]
# Add any non-secret config here if needed

# R2 bucket binding
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "my-storybooks-production"
preview_bucket_name = "my-storybooks-staging"

# Secrets are managed via `wrangler secret put` command
# - FIREBASE_PROJECT_ID
# - FIREBASE_CLIENT_EMAIL  
# - FIREBASE_PRIVATE_KEY
# - FIRESTORE_SERVICE_ACCOUNT_ID
# - R2_ACCOUNT_ID
# - R2_S3_ACCESS_KEY_ID
# - R2_S3_SECRET_ACCESS_KEY
# - R2_BUCKET_NAME
```

## Security Best Practices

### 1. Protect Service Account File
```bash
# Ensure serviceAccount.json is never committed
echo "serviceAccount.json" >> .gitignore
echo "*.json" >> .gitignore  # Be careful with this - might exclude package.json
echo "serviceAccount*.json" >> .gitignore  # More specific pattern
```

### 2. Limit Service Account Permissions

In Google Cloud Console:
1. Go to **IAM & Admin** > **Service Accounts**
2. Find your service account
3. Grant **minimum necessary permissions**:
   - `Cloud Datastore User` (for Firestore access)
   - Or more specific: `roles/datastore.user`

### 3. Rotate Keys Regularly

Create a rotation schedule:
```bash
# Every 90 days:
# 1. Generate new service account key in Google Cloud Console
# 2. Update secrets/environment variables
# 3. Delete old key after verification
```

### 4. Use Different Service Accounts per Environment

```bash
# Development
serviceAccount.dev.json -> FIRESTORE_SERVICE_ACCOUNT_ID="upload-service-dev"

# Staging  
serviceAccount.staging.json -> FIRESTORE_SERVICE_ACCOUNT_ID="upload-service-staging"

# Production
serviceAccount.prod.json -> FIRESTORE_SERVICE_ACCOUNT_ID="upload-service-prod"
```

## Verification Steps

### 1. Test Node.js Setup
```bash
# Build and start Node.js server
npm run build
npm run start:node

# Test Firestore connection (you'll add this endpoint)
curl http://localhost:3000/health
```

### 2. Test Worker Setup
```bash
# Start local Worker development
wrangler dev

# Test Firestore connection
curl http://localhost:8787/health
```

### 3. Verify Firestore Access

Create a test script [`scripts/test-firestore.ts`](scripts/test-firestore.ts:1):

```typescript
import admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize based on environment
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
} else {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')!
    })
  });
}

const db = admin.firestore();

async function testConnection() {
  try {
    // Try to write a test document
    const testRef = db.collection('_test').doc('connection');
    await testRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: 'Connection test successful'
    });
    
    // Read it back
    const doc = await testRef.get();
    console.log('✅ Firestore connection successful!');
    console.log('Test document data:', doc.data());
    
    // Clean up
    await testRef.delete();
    console.log('✅ Test document cleaned up');
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
    process.exit(1);
  }
}

testConnection();
```

Run the test:
```bash
npx tsx scripts/test-firestore.ts
```

## Troubleshooting

### Error: "Could not load the default credentials"
**Solution**: Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set or environment variables are properly configured.

### Error: "Invalid private key"
**Solution**: Check that the private key includes newline characters (`\n`). Use `.replace(/\\n/g, '\n')` when reading from environment variables.

### Error: "Permission denied"
**Solution**: Verify the service account has the correct Firestore permissions in Google Cloud Console.

### Error: "Project ID mismatch"
**Solution**: Ensure the `project_id` in serviceAccount.json matches your Firestore project.

## Environment Variable Summary

### Node.js (.env)
```bash
# Required for Firebase
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"

# Or use file path
GOOGLE_APPLICATION_CREDENTIALS="./serviceAccount.json"
```

### Cloudflare Workers (.dev.vars)
```bash
# All required values from serviceAccount.json
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIRESTORE_SERVICE_ACCOUNT_ID="upload-service"
```

### Production Secrets (wrangler secret put)
```bash
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY
wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID
```

## Next Steps

1. ✅ Set up service account credentials for Node.js
2. ✅ Set up service account credentials for Cloudflare Workers
3. ✅ Test Firestore connection in both environments
4. ➡️ Proceed with implementing FirestoreService (see [`FIRESTORE_INTEGRATION_PLAN.md`](FIRESTORE_INTEGRATION_PLAN.md:1))