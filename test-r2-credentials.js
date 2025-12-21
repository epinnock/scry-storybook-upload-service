import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// R2 credentials from .r2.secrets
const R2_ACCOUNT_ID = 'f54b9c10de9d140756dbf449aa124f1e';
const R2_ACCESS_KEY_ID = '4125fc825535fb8076b275415726f632';
const R2_SECRET_ACCESS_KEY = 'd769feaef9a7406867c5da576b1f7a0483a6cc1af8300b401f74677dde317479';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Create S3 client configured for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function testCredentials() {
  console.log('Testing R2 S3-Compatible Credentials...\n');
  console.log(`Endpoint: ${R2_ENDPOINT}\n`);

  try {
    // Test 1: List buckets
    console.log('✓ Test 1: Listing buckets...');
    const listBucketsCommand = new ListBucketsCommand({});
    const bucketsResponse = await s3Client.send(listBucketsCommand);
    
    if (bucketsResponse.Buckets && bucketsResponse.Buckets.length > 0) {
      console.log('✓ SUCCESS: Buckets found:');
      bucketsResponse.Buckets.forEach(bucket => {
        console.log(`  - ${bucket.Name} (created: ${bucket.CreationDate})`);
      });
    } else {
      console.log('⚠ WARNING: No buckets found');
    }

    // Test 2: List objects in production bucket
    console.log('\n✓ Test 2: Testing access to "my-storybooks-production" bucket...');
    const listObjectsCommand = new ListObjectsV2Command({
      Bucket: 'my-storybooks-production',
      MaxKeys: 5,
    });
    const objectsResponse = await s3Client.send(listObjectsCommand);
    
    if (objectsResponse.Contents && objectsResponse.Contents.length > 0) {
      console.log(`✓ SUCCESS: Found ${objectsResponse.KeyCount} objects (showing first 5):`);
      objectsResponse.Contents.forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes, modified: ${obj.LastModified})`);
      });
    } else {
      console.log('✓ SUCCESS: Bucket is accessible but empty or has no objects');
    }

    // Test 3: List objects in staging bucket
    console.log('\n✓ Test 3: Testing access to "my-storybooks-staging" bucket...');
    const listObjectsStaging = new ListObjectsV2Command({
      Bucket: 'my-storybooks-staging',
      MaxKeys: 5,
    });
    const stagingResponse = await s3Client.send(listObjectsStaging);
    
    if (stagingResponse.Contents && stagingResponse.Contents.length > 0) {
      console.log(`✓ SUCCESS: Found ${stagingResponse.KeyCount} objects (showing first 5):`);
      stagingResponse.Contents.forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes, modified: ${obj.LastModified})`);
      });
    } else {
      console.log('✓ SUCCESS: Bucket is accessible but empty or has no objects');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ ALL TESTS PASSED - Your R2 credentials are VALID and working!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✗ CREDENTIAL TEST FAILED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    
    if (error.name === 'InvalidAccessKeyId') {
      console.error('\n⚠ Your Access Key ID is invalid or has been revoked.');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.error('\n⚠ Your Secret Access Key is invalid or has been changed.');
    } else if (error.name === 'AccessDenied') {
      console.error('\n⚠ Your credentials are valid but lack necessary permissions.');
    } else {
      console.error('\n⚠ Unexpected error occurred.');
    }
    
    console.error('\nFull error details:');
    console.error(error);
    process.exit(1);
  }
}

testCredentials();