# cURL Commands for Testing Firestore Integration

## Prerequisites

1. Make sure your service is running:
   ```bash
   npm run dev
   # or
   node src/entry.node.js
   ```

2. Create a test ZIP file:
   ```bash
   echo "test content" > test.txt
   zip test.zip test.txt
   ```

3. Ensure Firestore is configured with proper environment variables.

## Test Commands

### 1. Health Check
```bash
curl -X GET http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 2. Get Presigned URL with Build Tracking
```bash
curl -X POST http://localhost:3000/presigned-url/test-project/1.0.0/test.zip \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (with Firestore configured):
```json
{
  "url": "https://your-bucket.r2.cloudflarestorage.com/test-project/1.0.0/test.zip?...",
  "fields": {
    "key": "test-project/1.0.0/test.zip"
  },
  "buildId": "abc123def456",
  "buildNumber": 1
}
```

### 3. Upload File Using Presigned URL
First get the presigned URL, then use it to upload:

```bash
# Step 1: Get presigned URL and extract it
PRESIGNED_RESPONSE=$(curl -s -X POST http://localhost:3000/presigned-url/test-project/1.0.0/test.zip \
  -H "Content-Type: application/json" \
  -d '{}')

echo "Presigned URL Response:"
echo $PRESIGNED_RESPONSE | jq '.'

# Step 2: Extract the URL (requires jq)
PRESIGNED_URL=$(echo $PRESIGNED_RESPONSE | jq -r '.url')

# Step 3: Upload the file
curl -X PUT "$PRESIGNED_URL" \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip
```

### 4. Direct Upload with Build Tracking
```bash
curl -X POST http://localhost:3000/upload/test-project/1.0.0 \
  -F "file=@test.zip" \
  -H "Content-Type: multipart/form-data"
```

Expected response:
```json
{
  "success": true,
  "message": "Upload successful",
  "key": "test-project/1.0.0/storybook.zip",
  "data": {
    "url": "https://your-bucket.r2.cloudflarestorage.com/test-project/1.0.0/storybook.zip",
    "path": "test-project/1.0.0/storybook.zip",
    "versionId": "optional-version-id",
    "buildId": "abc123def456",
    "buildNumber": 1
  }
}
```

### 5. Test Build Number Increment
Upload another version to see build number increment:

```bash
curl -X POST http://localhost:3000/presigned-url/test-project/1.0.1/test.zip \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (buildNumber should be 2):
```json
{
  "url": "https://your-bucket.r2.cloudflarestorage.com/test-project/1.0.1/test.zip?...",
  "fields": {
    "key": "test-project/1.0.1/test.zip"
  },
  "buildId": "def456ghi789",
  "buildNumber": 2
}
```

### 6. Test Different Project (Build Number Resets)
```bash
curl -X POST http://localhost:3000/presigned-url/another-project/1.0.0/test.zip \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (buildNumber should be 1 for new project):
```json
{
  "url": "https://your-bucket.r2.cloudflarestorage.com/another-project/1.0.0/test.zip?...",
  "fields": {
    "key": "another-project/1.0.0/test.zip"
  },
  "buildId": "ghi789jkl012",
  "buildNumber": 1
}
```

### 7. Test Raw Binary Upload
```bash
curl -X POST http://localhost:3000/upload/binary-test/1.0.0 \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip
```

## Complete Test Script

Here's a complete bash script to test the integration:

```bash
#!/bin/bash

# Test script for Firestore integration
BASE_URL="http://localhost:3000"

echo "🧪 Testing Firestore Integration"
echo "================================"

# Create test file if it doesn't exist
if [ ! -f "test.zip" ]; then
    echo "Creating test.zip..."
    echo "test content" > test.txt
    zip test.zip test.txt
    rm test.txt
fi

echo ""
echo "1. 🏥 Health Check"
curl -s -X GET $BASE_URL/health | jq '.'

echo ""
echo "2. 🔗 Get Presigned URL with Build Tracking"
PRESIGNED_RESPONSE=$(curl -s -X POST $BASE_URL/presigned-url/curl-test/1.0.0/test.zip \
  -H "Content-Type: application/json" \
  -d '{}')

echo $PRESIGNED_RESPONSE | jq '.'

# Extract build info
BUILD_ID=$(echo $PRESIGNED_RESPONSE | jq -r '.buildId // "N/A"')
BUILD_NUMBER=$(echo $PRESIGNED_RESPONSE | jq -r '.buildNumber // "N/A"')

echo ""
echo "📊 Build Info:"
echo "   Build ID: $BUILD_ID"
echo "   Build Number: $BUILD_NUMBER"

echo ""
echo "3. 📤 Upload File Using Presigned URL"
PRESIGNED_URL=$(echo $PRESIGNED_RESPONSE | jq -r '.url')

if [ "$PRESIGNED_URL" != "null" ]; then
    UPLOAD_RESULT=$(curl -s -X PUT "$PRESIGNED_URL" \
      -H "Content-Type: application/zip" \
      --data-binary @test.zip \
      -w "HTTP_CODE:%{http_code}")
    
    HTTP_CODE=$(echo $UPLOAD_RESULT | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
    echo "Upload HTTP Status: $HTTP_CODE"
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ Upload successful!"
    else
        echo "❌ Upload failed!"
    fi
else
    echo "❌ No presigned URL received"
fi

echo ""
echo "4. 🔢 Test Build Number Increment"
PRESIGNED_RESPONSE_2=$(curl -s -X POST $BASE_URL/presigned-url/curl-test/1.0.1/test.zip \
  -H "Content-Type: application/json" \
  -d '{}')

BUILD_NUMBER_2=$(echo $PRESIGNED_RESPONSE_2 | jq -r '.buildNumber // "N/A"')
echo "Second upload build number: $BUILD_NUMBER_2"

echo ""
echo "5. 📋 Direct Upload Test"
DIRECT_RESPONSE=$(curl -s -X POST $BASE_URL/upload/curl-direct/1.0.0 \
  -F "file=@test.zip")

echo $DIRECT_RESPONSE | jq '.'

echo ""
echo "🎉 Test completed!"
```

Save this as `test-integration.sh`, make it executable with `chmod +x test-integration.sh`, and run it with `./test-integration.sh`.

## Troubleshooting

### If Firestore is not configured:
- `buildId` and `buildNumber` will not be present in responses
- Check your environment variables:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `FIRESTORE_SERVICE_ACCOUNT_ID` (optional)

### If uploads fail:
- Check that your R2/S3 credentials are properly configured
- Verify the service is running on the correct port
- Check the service logs for error messages

### Common HTTP Status Codes:
- `200`: Successful presigned URL upload
- `201`: Successful direct upload
- `400`: Bad request (missing file, validation error)
- `413`: File too large (>5MB)
- `500`: Server error (check logs)
