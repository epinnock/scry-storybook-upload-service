import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// R2 credentials from .r2.secrets
const R2_ACCOUNT_ID = 'f54b9c10de9d140756dbf449aa124f1e';
const R2_ACCESS_KEY_ID = '4125fc825535fb8076b275415726f632';
const R2_SECRET_ACCESS_KEY = 'd769feaef9a7406867c5da576b1f7a0483a6cc1af8300b401f74677dde317479';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const BUCKET_NAME = 'my-storybooks-production'; // Testing with production

// Create S3 client
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function testPresignedUrl() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Testing R2 Presigned URL Upload');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testKey = `test-presigned-upload-${Date.now()}/test.zip`;
  const contentType = 'application/zip';

  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Test Key: ${testKey}`);
  console.log(`Content-Type: ${contentType}\n`);

  try {
    // Step 1: Generate presigned URL
    console.log('Step 1: Generating presigned URL...');
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testKey,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log('✓ Presigned URL generated successfully');
    console.log(`URL: ${presignedUrl.substring(0, 100)}...`);
    console.log(`URL Length: ${presignedUrl.length} characters\n`);

    // Step 2: Create test file
    console.log('Step 2: Creating test file...');
    const testData = Buffer.from('This is a test file for presigned URL upload');
    console.log(`✓ Test file created: ${testData.length} bytes\n`);

    // Step 3: Upload using presigned URL with fetch
    console.log('Step 3: Uploading to presigned URL using fetch...');
    
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: testData,
      headers: {
        'Content-Type': contentType,
        'Content-Length': testData.length.toString(),
      },
    });

    console.log(`Response Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
    console.log('Response Headers:');
    for (const [key, value] of uploadResponse.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('\n✗ Upload FAILED');
      console.log('Error Response Body:');
      console.log(errorText);
      
      // Parse error if it's XML
      if (errorText.includes('<?xml')) {
        console.log('\n⚠ This is an R2/S3 error response. Common issues:');
        console.log('  1. Content-Type mismatch between presigned URL and actual upload');
        console.log('  2. Missing or incorrect headers');
        console.log('  3. Expired signature');
        console.log('  4. CORS configuration issues');
      }
      
      return false;
    }

    console.log('\n✓ Upload successful!\n');

    // Step 4: Verify the upload
    console.log('Step 4: Verifying upload...');
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testKey,
    });
    
    const getResult = await s3Client.send(getCommand);
    console.log('✓ File exists in bucket');
    console.log(`  Content-Type: ${getResult.ContentType}`);
    console.log(`  Content-Length: ${getResult.ContentLength}`);
    console.log(`  ETag: ${getResult.ETag}`);

    // Step 5: Clean up
    console.log('\nStep 5: Cleaning up test file...');
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: testKey,
    });
    await s3Client.send(deleteCommand);
    console.log('✓ Test file deleted');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ ALL PRESIGNED URL TESTS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Your presigned URL implementation is working correctly!');
    console.log('If you\'re having issues, please share:');
    console.log('  1. The exact error message you\'re receiving');
    console.log('  2. How you\'re uploading (curl, JavaScript, etc.)');
    console.log('  3. The Content-Type you\'re using\n');

    return true;

  } catch (error) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✗ PRESIGNED URL TEST FAILED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    
    if (error.message.includes('403')) {
      console.error('\n⚠ Possible causes:');
      console.error('  1. Signature mismatch - ContentType in presigned URL must match upload');
      console.error('  2. Expired presigned URL');
      console.error('  3. Invalid credentials or permissions');
    } else if (error.message.includes('SignatureDoesNotMatch')) {
      console.error('\n⚠ Signature mismatch detected!');
      console.error('  Make sure the Content-Type header in your upload request');
      console.error('  EXACTLY matches the ContentType used when generating the presigned URL');
    }
    
    console.error('\nFull error details:');
    console.error(error);
    return false;
  }
}

// Run the test
testPresignedUrl().then(success => {
  process.exit(success ? 0 : 1);
});