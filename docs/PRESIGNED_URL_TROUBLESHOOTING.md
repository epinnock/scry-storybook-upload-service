# Presigned URL Upload Troubleshooting Guide

## Test Results Summary

✅ **All R2 Credentials Valid**
- Cloudflare API Token: Working
- S3 Access Key & Secret: Working
- Production bucket (`my-storybooks-production`): Accessible
- Staging bucket (`my-storybooks-staging`): Accessible

✅ **Presigned URL Upload Tests**
- URL Generation: Working
- Upload via presigned URL: Working
- File verification: Working

## Common Issues & Solutions

### 1. **SignatureDoesNotMatch Error**

**Cause**: The Content-Type header in your upload request doesn't match the Content-Type used when generating the presigned URL.

**Solution**:
```javascript
// When generating presigned URL
const presignedUrl = await storage.getPresignedUploadUrl(key, 'application/zip');

// When uploading, use EXACT same Content-Type
await fetch(presignedUrl.url, {
  method: 'PUT',
  body: fileData,
  headers: {
    'Content-Type': 'application/zip'  // Must match exactly!
  }
});
```

### 2. **403 Forbidden Error**

**Possible Causes**:
- Expired presigned URL (URLs are valid for 1 hour)
- Incorrect bucket permissions
- CORS issues (if uploading from browser)

**Solutions**:
- Generate a fresh presigned URL
- Check that credentials have write permissions
- Configure CORS on the R2 bucket for browser uploads

### 3. **CORS Errors (Browser Only)**

**Symptoms**: Console error like "has been blocked by CORS policy"

**Solution**: Configure CORS on your R2 bucket using Wrangler:

```bash
# Create cors.json
cat > cors.json << 'EOF'
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
EOF

# Apply CORS configuration
wrangler r2 bucket cors put my-storybooks-production --cors-config cors.json
```

### 4. **File Upload Appears to Succeed But File is Empty/Corrupted**

**Cause**: Incorrect Content-Type or missing Content-Length header

**Solution**:
```javascript
const fileData = await file.arrayBuffer();

await fetch(presignedUrl.url, {
  method: 'PUT',
  body: fileData,
  headers: {
    'Content-Type': 'application/zip',
    'Content-Length': fileData.byteLength.toString()
  }
});
```

### 5. **Upload Works in Tests But Fails in Application**

**Possible Issues**:
- Different Content-Type being sent
- File being modified/corrupted before upload
- Network timeout (try increasing timeout for large files)

**Debug Steps**:
1. Log the presigned URL being generated
2. Log the exact headers being sent
3. Compare working test vs failing application

## Testing Your Uploads

### Quick Test Script

Use the provided test scripts to verify your setup:

```bash
# Test basic R2 credentials
node test-r2-credentials.js

# Test presigned URL generation and upload
node test-presigned-url.js
```

### Manual cURL Test

Generate a presigned URL from your application, then test with curl:

```bash
# Replace with your actual presigned URL
curl -X PUT \
  -H "Content-Type: application/zip" \
  --data-binary "@yourfile.zip" \
  "YOUR_PRESIGNED_URL_HERE"
```

Expected response: HTTP 200 OK

### Browser JavaScript Example

```javascript
async function uploadToPresignedUrl(presignedUrl, file) {
  try {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/zip',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', response.status, errorText);
      throw new Error(`Upload failed: ${response.status}`);
    }

    console.log('Upload successful!', response.status);
    return true;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Usage
const presignedData = await fetch('/presigned-url/myproject/1.0.0/storybook.zip', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contentType: 'application/zip' })
}).then(r => r.json());

await uploadToPresignedUrl(presignedData.url, fileFromInput);
```

### Node.js Example

```javascript
import { readFileSync } from 'fs';

async function uploadFile(presignedUrl, filePath) {
  const fileData = readFileSync(filePath);
  
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    body: fileData,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': fileData.length.toString(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  return response;
}
```

## Debugging Checklist

When experiencing upload issues, check:

- [ ] Credentials are valid (run `node test-r2-credentials.js`)
- [ ] Presigned URL generation works (run `node test-presigned-url.js`)
- [ ] Content-Type in upload matches Content-Type in presigned URL generation
- [ ] File is not empty or corrupted before upload
- [ ] URL hasn't expired (regenerate if older than 1 hour)
- [ ] Network connectivity to R2 endpoint
- [ ] CORS is configured if uploading from browser
- [ ] Correct HTTP method (PUT, not POST)
- [ ] Request headers are correctly set

## Getting More Help

If issues persist, please provide:

1. **Error Message**: Exact error text or HTTP status code
2. **Upload Method**: Are you using fetch, axios, curl, etc.?
3. **Environment**: Browser or server-side (Node.js, Workers)?
4. **Content-Type**: What Content-Type are you using?
5. **Code Sample**: Share the code generating and using the presigned URL
6. **Network Logs**: Browser DevTools Network tab or curl verbose output

## Useful Commands

### Check CORS Configuration
```bash
wrangler r2 bucket cors get my-storybooks-production
```

### List Recent Uploads
```bash
export CLOUDFLARE_API_TOKEN="DAdWXw1EcjG-aSq7Gu-...FT"
wrangler r2 object list my-storybooks-production --limit 10
```

### Test Upload with AWS CLI (if installed)
```bash
aws s3 cp yourfile.zip s3://my-storybooks-production/test/yourfile.zip \
  --endpoint-url https://f54b9c10de9d140756dbf449aa124f1e.r2.cloudflarestorage.com \
  --profile r2
```

## Architecture Reference

Your current setup uses:
- **Storage Service**: [`src/services/storage/storage.service.ts`](src/services/storage/storage.service.ts:1)
- **Worker Implementation**: [`src/services/storage/storage.worker.ts`](src/services/storage/storage.worker.ts:1)
- **Node Implementation**: [`src/services/storage/storage.node.ts`](src/services/storage/storage.node.ts:1)
- **API Routes**: [`src/app.ts`](src/app.ts:360) (presigned URL endpoint at line 360)

The presigned URL is generated in both implementations using AWS SDK's `getSignedUrl` function with a 1-hour expiration.