# Production Deployment Setup Instructions

## Prerequisites

Before deploying to production, ensure you have:
- ✅ Wrangler CLI installed (`npm install -g wrangler`)
- ✅ Authenticated with Cloudflare (`wrangler login`)
- ✅ R2 production bucket created and public access enabled
- ✅ Firebase service account credentials from `serviceAccount.json`
- ✅ Project built successfully (`pnpm run build`)

## Step 1: Set R2 Storage Secrets

For production deployment, sensitive credentials must be stored as Cloudflare Worker secrets (not in files):

### 1. Set R2 Account ID
```bash
wrangler secret put R2_ACCOUNT_ID
# When prompted, enter your Cloudflare account ID
```

### 2. Set R2 S3 Access Key ID
```bash
wrangler secret put R2_S3_ACCESS_KEY_ID
# When prompted, enter your R2 S3 access key ID
```

### 3. Set R2 S3 Secret Access Key
```bash
wrangler secret put R2_S3_SECRET_ACCESS_KEY
# When prompted, enter your R2 S3 secret access key
```

### 4. Set R2 Bucket Name (Production)
```bash
wrangler secret put R2_BUCKET_NAME
# When prompted, enter: my-storybooks-production
```

## Step 2: Set Firebase/Firestore Secrets

Extract these values from your `serviceAccount.json` file:

### 1. Set Firebase Project ID
```bash
wrangler secret put FIREBASE_PROJECT_ID
# When prompted, enter the value from serviceAccount.json "project_id"
```

### 2. Set Firebase Client Email
```bash
wrangler secret put FIREBASE_CLIENT_EMAIL
# When prompted, enter the value from serviceAccount.json "client_email"
```

### 3. Set Firebase Private Key
```bash
wrangler secret put FIREBASE_PRIVATE_KEY
# When prompted, paste the ENTIRE value from serviceAccount.json "private_key"
# Including: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# Make sure to include the quotes and literal \n characters
```

### 4. Set Firestore Service Account ID
```bash
wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID
# When prompted, enter: upload-service
```

## Step 3: Verify All Secrets

```bash
wrangler secret list
```

You should see all 8 secrets listed:
- R2_ACCOUNT_ID
- R2_S3_ACCESS_KEY_ID
- R2_S3_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- FIRESTORE_SERVICE_ACCOUNT_ID

## Step 4: Build the Project

```bash
# Install dependencies (if not already done)
pnpm install

# Build the project
pnpm run build
```

## Step 5: Deploy to Production

```bash
wrangler deploy
```

The deployment will:
- ✅ Build and bundle your Worker code
- ✅ Upload to Cloudflare's edge network
- ✅ Configure R2 bucket bindings
- ✅ Apply all secrets
- ✅ Make your Worker available globally

## Important Notes

- **Security**: Never commit these values to Git. They are stored securely in Cloudflare's infrastructure.
- **Environment Separation**: Local development uses staging bucket (`my-storybooks-staging`), production uses production bucket (`my-storybooks-production`).
- **Bucket Configuration**: The `wrangler.toml` file defines both production and preview bucket bindings automatically.

## Step 6: Verify Deployment

After successful deployment, you'll see output like:
```
✨ Built successfully
🌎 Published storybook-deployment-service
   https://storybook-deployment-service.<your-subdomain>.workers.dev
```

### Test the Deployment

#### 1. Health Check
```bash
curl https://storybook-deployment-service.<your-subdomain>.workers.dev/
```

**Expected**: 200 OK with service information

#### 2. Test Direct Upload
```bash
curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  https://storybook-deployment-service.epinnock.workers.dev/upload/test-project/v1.0.0.3
```

**Expected**: 201 Created with build tracking data including `buildId` and `buildNumber`

#### 3. Test Presigned URL Generation
```bash
curl -X POST \
  -H "Content-Type: application/zip" \
  https://storybook-deployment-service.epinnock.workers.dev/presigned-url/test-project/v1.0.0/storybook.zip
```

**Expected**: 200 OK with presigned URL and build tracking data

#### 4. Verify in Firebase Console

1. Go to https://console.firebase.google.com
2. Select your project
3. Navigate to Firestore Database
4. Check `projects/test-project/builds/` for new build records
5. Verify `buildNumber` is incrementing correctly

## Step 7: Enable R2 Public Access (If Not Done)

If downloads fail with "Authorization" errors:

1. Go to Cloudflare Dashboard → R2
2. Select `my-storybooks-production` bucket
3. Go to Settings → Public access
4. Click "Allow Access"
5. Wait a few moments for propagation

## Troubleshooting

### Deployment Fails
```bash
# Check you're logged in
wrangler whoami

# Re-authenticate if needed
wrangler login
```

### Secrets Not Working
```bash
# Verify all secrets are set
wrangler secret list

# Re-set any missing secret
wrangler secret put SECRET_NAME
```

### Build Errors
```bash
# Clean and rebuild
rm -rf dist node_modules/.cache
pnpm run build
```

### Firebase Authentication Fails
- Verify FIREBASE_PRIVATE_KEY includes the full key with header/footer
- Ensure literal `\n` characters (not actual newlines) are preserved
- Check FIREBASE_PROJECT_ID matches your Firebase project

## Monitoring

### View Logs
```bash
# Real-time logs
wrangler tail

# Or view in Cloudflare Dashboard
# Workers & Pages → storybook-deployment-service → Logs
```

### Check Metrics
- Go to Cloudflare Dashboard
- Workers & Pages → storybook-deployment-service
- View requests, errors, and performance metrics

## Updating the Deployment

When you make code changes:

```bash
# 1. Build
pnpm run build

# 2. Deploy
wrangler deploy
```

Secrets persist across deployments and don't need to be re-set unless changed.

## Rolling Back

If you need to rollback to a previous version:

```bash
# List deployments
wrangler deployments list

# Rollback to specific deployment
wrangler rollback [deployment-id]
```