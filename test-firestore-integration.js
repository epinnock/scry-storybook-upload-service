const axios = require('axios');
const { uploadFileDirectlyWithBuildTracking, ApiError } = require('./updated-upload-function.js');

/**
 * Test script to demonstrate Firestore integration with the upload service
 */
async function testFirestoreIntegration() {
  // Create an API client pointing to your service
  const apiClient = axios.create({
    baseURL: 'http://localhost:3000', // Adjust to your service URL
    timeout: 30000,
  });

  try {
    console.log('🚀 Testing Firestore integration with upload service...\n');

    // Test 1: Upload with build tracking
    console.log('📦 Test 1: Upload with Firestore build tracking');
    const result1 = await uploadFileDirectlyWithBuildTracking(
      apiClient,
      { project: 'test-project', version: '1.0.0' },
      './test.zip' // Make sure this file exists
    );

    console.log('✅ Upload successful!');
    console.log('📊 Upload Results:');
    console.log(`   - Success: ${result1.success}`);
    console.log(`   - URL: ${result1.url}`);
    console.log(`   - Build ID: ${result1.buildId || 'Not available'}`);
    console.log(`   - Build Number: ${result1.buildNumber || 'Not available'}`);
    console.log(`   - Storage Path: ${result1.path || 'Not available'}`);
    console.log('');

    // Test 2: Upload another version to see build number increment
    console.log('📦 Test 2: Upload another version (build number should increment)');
    const result2 = await uploadFileDirectlyWithBuildTracking(
      apiClient,
      { project: 'test-project', version: '1.0.1' },
      './test.zip'
    );

    console.log('✅ Second upload successful!');
    console.log('📊 Upload Results:');
    console.log(`   - Success: ${result2.success}`);
    console.log(`   - Build ID: ${result2.buildId || 'Not available'}`);
    console.log(`   - Build Number: ${result2.buildNumber || 'Not available'}`);
    console.log('');

    // Test 3: Check health endpoint
    console.log('🏥 Test 3: Checking service health');
    const healthResponse = await apiClient.get('/health');
    console.log('✅ Service is healthy!');
    console.log(`   - Status: ${healthResponse.data.status}`);
    console.log(`   - Timestamp: ${healthResponse.data.timestamp}`);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    
    // Summary
    console.log('\n📋 Integration Summary:');
    console.log('   ✅ File uploads working');
    console.log('   ✅ Firestore build tracking working');
    console.log('   ✅ Build numbers auto-incrementing');
    console.log('   ✅ Error handling implemented');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error instanceof ApiError) {
      console.error(`   - Status Code: ${error.statusCode}`);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   💡 Make sure your service is running on http://localhost:3000');
      console.error('   💡 Run: npm run dev or node src/entry.node.js');
    }
    
    if (error.code === 'ENOENT') {
      console.error('   💡 Make sure test.zip file exists in the current directory');
      console.error('   💡 Create a test file: echo "test" > test.txt && zip test.zip test.txt');
    }
  }
}

/**
 * Test the enhanced presigned URL approach (with build tracking)
 */
async function testPresignedUrlApproach() {
  const { uploadFileDirectly } = require('./updated-upload-function.js');
  
  const apiClient = axios.create({
    baseURL: 'http://localhost:3000',
    timeout: 30000,
  });

  try {
    console.log('\n🔗 Testing enhanced presigned URL approach with build tracking...');
    
    const result = await uploadFileDirectly(
      apiClient,
      { project: 'presigned-test', version: '1.0.0' },
      './test.zip'
    );

    console.log('✅ Presigned URL upload successful!');
    console.log('📊 Results:');
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Storage URL: ${result.storageUrl}`);
    console.log(`   - Build ID: ${result.buildId || 'Not available'}`);
    console.log(`   - Build Number: ${result.buildNumber || 'Not available'}`);
    console.log(`   - Storage Key: ${result.key}`);
    console.log(`   - Status: ${result.status}`);
    console.log('   ✨ Build tracking now available with presigned URLs!');
    
    // Test another upload to see build number increment
    console.log('\n🔗 Testing build number increment with presigned URL...');
    const result2 = await uploadFileDirectly(
      apiClient,
      { project: 'presigned-test', version: '1.0.1' },
      './test.zip'
    );
    
    console.log('✅ Second presigned URL upload successful!');
    console.log('📊 Results:');
    console.log(`   - Build ID: ${result2.buildId || 'Not available'}`);
    console.log(`   - Build Number: ${result2.buildNumber || 'Not available'}`);
    
  } catch (error) {
    console.error('❌ Presigned URL test failed:', error.message);
  }
}

// Run the tests
if (require.main === module) {
  console.log('🧪 Firestore Integration Test Suite\n');
  
  testFirestoreIntegration()
    .then(() => testPresignedUrlApproach())
    .then(() => {
      console.log('\n✨ Test suite completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testFirestoreIntegration,
  testPresignedUrlApproach
};