# Fix: Presigned URL Upload Issue

## 🔍 Root Cause Identified

Your production Worker at `storybook-deployment-service.epinnock.workers.dev` is using **placeholder credentials** instead of actual R2 access keys.

**Error Evidence**:
```xml
<Error>
  <Code>InvalidArgument</Code>
  <Message>Credential access key has length 39, should be 32</Message>
</Error>
```

The presigned URL contains: `placeholder-set-via-dev-vars-or-secrets` (39 chars)  
Should contain: `4125fc825535fb8076b275415726f632` (32 chars)

## ✅ Solution: Configure Production Worker Secrets

You need to set the R2 credentials as **secrets** in your production Worker. There are two methods:

### Method 1: Via Cloudflare Dashboard (Recommended)

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/f54b9c10de9d140756dbf449aa124f1e/workers-and-pages
   - Click on your Worker: `storybook-deployment-service`

2. **Navigate to Settings**
   - Click "Settings" tab
   - Scroll to "Environment Variables" section

3. **Add the following secrets** (click "Add variable" for each):

   **Secret 1:**
   - Variable name: `R2_S3_ACCESS_KEY_ID`
   - Type: Select "Secret" (encrypted)
   - Value: `4125fc825535fb8076b275415726f632`
   - Click "Save"

   **Secret 2:**
   - Variable name: `R2_S3_SECRET_ACCESS_KEY`
   - Type: Select "Secret" (encrypted)
   - Value: `d769feaef9a7406867c5da576b1f7a0483a6cc1af8300b401f74677dde317479`
   - Click "Save"

4. **Deploy changes**
   - Click "Save and Deploy" or the deployment will happen automatically

### Method 2: Via Wrangler CLI (Requires Token Update)

If you want to use Wrangler, you'll need to update your API token permissions first:

1. **Update API Token Permissions**
   - Visit: https://dash.cloudflare.com/f54b9c10de9d140756dbf449aa124f1e/api-tokens
   - Find your current token (used for R2)
   - Edit it to include: `Workers Scripts:Edit` permission
   - Save changes

2. **Set secrets via Wrangler**
   ```bash
   export CLOUDFLARE_API_TOKEN="DAdWXw1EcjG-aSq7Gu-zzNJrO6lwZpgpP3uhUzFT"
   
   # Set Access Key ID
   echo "4125fc825535fb8076b275415726f632" | wrangler secret put R2_S3_ACCESS_KEY_ID --env=""
   
   # Set Secret Access Key
   echo "d769feaef9a7406867c5da576b1f7a0483a6cc1af8300b401f74677dde317479" | wrangler secret put R2_S3_SECRET_ACCESS_KEY --env=""
   ```

## 🧪 Testing After Fix

Once you've set the secrets, test the presigned URL flow:

### Step 1: Request Presigned URL
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"contentType":"application/zip"}' \
  https://storybook-deployment-service.epinnock.workers.dev/presigned-url/test-project/v1.0.0/storybook.zip
```

**Expected**: URL should contain the ACTUAL access key (starting with `4125fc8...`), not the placeholder

### Step 2: Upload Using Presigned URL
```bash
# Save the response from Step 1
PRESIGNED_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"contentType":"application/zip"}' \
  https://storybook-deployment-service.epinnock.workers.dev/presigned-url/test-project/v1.0.0/storybook.zip)

# Extract the URL (requires jq, or copy manually)
PRESIGNED_URL=$(echo $PRESIGNED_RESPONSE | jq -r '.url')

# Upload file
curl -X PUT \
  -H "Content-Type: application/zip" \
  --data-binary @storybook-fixed.zip \
  "$PRESIGNED_URL"
```

**Expected**: `200 OK` response from R2

### Step 3: Verify Upload
```bash
# List recent uploads
export CLOUDFLARE_API_TOKEN="DAdWXw1EcjG-aSq7Gu-zzNJrO6lwZpgpP3uhUzFT"
wrangler r2 object list my-storybooks-production --limit 5
```

## 📝 Technical Details

### Where the Issue Occurs

In [`src/entry.worker.ts`](src/entry.worker.ts), the Worker creates the storage service:

```typescript
const storageService = new R2S3StorageService(env.STORYBOOK_BUCKET, {
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_S3_ACCESS_KEY_ID,      // ← This is the placeholder
  secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY, // ← This too
  bucketName: env.R2_BUCKET_NAME,
});
```

### Current Configuration

From [`wrangler.toml`](wrangler.toml:44):
```toml
[vars]
R2_ACCOUNT_ID = "f54b9c10de9d140756dbf449aa124f1e"
R2_BUCKET_NAME = "my-storybooks-production"
R2_S3_ACCESS_KEY_ID = "placeholder-set-via-dev-vars-or-secrets"  # ← Problem!
R2_S3_SECRET_ACCESS_KEY = "placeholder-set-via-dev-vars-or-secrets"  # ← Problem!
```

**Note**: These are intentionally placeholders in the config file. The actual values MUST be set as **encrypted secrets**, not committed to the repository.

### Why Secrets Instead of Vars?

- ✅ **Secrets**: Encrypted, not visible in logs, secure
- ❌ **Vars**: Plain text, visible in deployment, insecure

R2 credentials should ALWAYS be secrets, never plain text variables.

## 🔒 Security Best Practices

1. ✅ **Never commit secrets to Git** (already done correctly in your `.gitignore`)
2. ✅ **Use environment-specific secrets** for staging/production
3. ✅ **Rotate credentials regularly**
4. ✅ **Use API tokens with minimal required permissions**

## 📚 Related Files

- Configuration: [`wrangler.toml`](wrangler.toml:1)
- Worker Entry: [`src/entry.worker.ts`](src/entry.worker.ts:1)
- Storage Service: [`src/services/storage/storage.worker.ts`](src/services/storage/storage.worker.ts:1)
- Credentials Reference: [`.r2.secrets`](.r2.secrets:1)

## 📞 Need Help?

If you encounter issues after setting the secrets:

1. Check the Worker logs: https://dash.cloudflare.com/f54b9c10de9d140756dbf449aa124f1e/workers/services/view/storybook-deployment-service/production/logs
2. Verify secrets are set: Check Environment Variables in Worker settings
3. Try redeploying: `wrangler deploy`
4. Test locally first: `wrangler dev` (uses `.dev.vars` file)