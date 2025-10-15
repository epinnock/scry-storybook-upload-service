const fs = require('fs');
const axios = require('axios');

/**
 * Enhanced upload response structure that includes Firestore build data
 * @typedef {Object} UploadResponse
 * @property {boolean} success - Whether the upload was successful
 * @property {string} message - Response message
 * @property {string} key - Storage key/path
 * @property {Object} data - Upload result data
 * @property {string} data.url - URL to the uploaded file
 * @property {string} data.path - Storage path
 * @property {string} [data.versionId] - Storage version ID
 * @property {string} [data.buildId] - Firestore build ID
 * @property {number} [data.buildNumber] - Auto-incrementing build number
 */

/**
 * API Error class for handling upload failures
 */
class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Uploads a file using presigned URL with Firestore build tracking
 * @param {Object} apiClient - Axios client instance
 * @param {Object} params - Upload parameters
 * @param {string} params.project - Project name
 * @param {string} params.version - Version identifier
 * @param {string} filePath - Path to the file to upload
 * @returns {Promise<UploadResponse>} Upload result with build tracking data
 */
async function uploadFileDirectly(apiClient, { project, version }, filePath) {
  // This is a mock check to allow testing of a 500 server error.
  if (project === 'fail-me-500') {
    throw new ApiError('The deployment service encountered an internal error.', 500);
  }

  // Default to 'main' and 'latest' if not provided
  const projectName = project || 'main';
  const versionName = version || 'latest';

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = `${projectName}-${versionName}.zip`;

  try {
    // Step 1: Request a presigned URL (now includes Firestore build tracking)
    console.log(`[DEBUG] Requesting presigned URL for /presigned-url/${projectName}/${versionName}/${fileName}`);
    const presignedResponse = await apiClient.post(
      `/presigned-url/${projectName}/${versionName}/${fileName}`,
      {},
      {
        headers: {
          'Content-Type': 'application/zip',
        },
      }
    );

    const presignedData = presignedResponse.data;
    const presignedUrl = presignedData.url;
    
    if (!presignedUrl) {
      throw new ApiError('Failed to get presigned URL from server response');
    }

    // Extract build tracking data from presigned URL response
    const buildId = presignedData.buildId;
    const buildNumber = presignedData.buildNumber;
    
    if (buildId) {
      console.log(`[INFO] Build record created: ID=${buildId}, Number=${buildNumber}`);
    }

    console.log(`[DEBUG] Received presigned URL, uploading file...`);

    // Step 2: Upload the file to the presigned URL using PUT
    const uploadResponse = await axios.put(presignedUrl, fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log(`[DEBUG] File uploaded successfully with build tracking`);

    // Step 3: Return result with build tracking data
    const result = {
      success: true,
      url: presignedUrl,
      status: uploadResponse.status,
      key: presignedData.fields.key,
      buildId: buildId,
      buildNumber: buildNumber,
      // Extract the clean URL without query parameters for storage reference
      storageUrl: presignedUrl.split('?')[0]
    };

    return result;
  } catch (error) {
    if (error.response) {
      // Enhanced error handling for Firestore-related errors
      const errorMessage = error.response.data?.error || 
        `${error.response.status} ${error.response.statusText}`;
      
      // Check if this is a Firestore-related error (non-fatal for uploads)
      if (error.response.status === 201 && error.response.data?.success) {
        // Upload succeeded but Firestore may have failed
        console.warn('[WARN] Upload succeeded but Firestore tracking may have failed');
        return error.response.data;
      }
      
      throw new ApiError(
        `Failed to upload file: ${errorMessage}${
          error.response.data ? ` - ${JSON.stringify(error.response.data)}` : ''
        }`,
        error.response.status
      );
    } else if (error.request) {
      throw new ApiError(`Failed to upload file: No response from server at ${apiClient.defaults.baseURL}`);
    } else {
      throw new ApiError(`Failed to upload file: ${error.message}`);
    }
  }
}

/**
 * Alternative: Direct upload function that uses the /upload endpoint
 * This approach will return buildId and buildNumber from Firestore
 */
async function uploadFileDirectlyWithBuildTracking(apiClient, { project, version }, filePath) {
  // This is a mock check to allow testing of a 500 server error.
  if (project === 'fail-me-500') {
    throw new ApiError('The deployment service encountered an internal error.', 500);
  }

  // Default to 'main' and 'latest' if not provided
  const projectName = project || 'main';
  const versionName = version || 'latest';

  const fileBuffer = fs.readFileSync(filePath);

  try {
    console.log(`[DEBUG] Uploading file directly to /upload/${projectName}/${versionName}`);

    // Create FormData for multipart upload
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: `${projectName}-${versionName}.zip`,
      contentType: 'application/zip'
    });

    // Upload directly to the /upload endpoint
    const uploadResponse = await apiClient.post(
      `/upload/${projectName}/${versionName}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    console.log(`[DEBUG] File uploaded successfully with build tracking`);
    
    // Extract build information from response
    const responseData = uploadResponse.data;
    if (responseData.data?.buildId) {
      console.log(`[INFO] Build created: ID=${responseData.data.buildId}, Number=${responseData.data.buildNumber}`);
    } else {
      console.log(`[INFO] Upload successful but Firestore tracking not available`);
    }

    return {
      success: responseData.success,
      url: responseData.data.url,
      status: uploadResponse.status,
      buildId: responseData.data.buildId,
      buildNumber: responseData.data.buildNumber,
      key: responseData.key,
      path: responseData.data.path,
      versionId: responseData.data.versionId
    };
  } catch (error) {
    if (error.response) {
      // Enhanced error handling for Firestore-related errors
      const errorMessage = error.response.data?.error || 
        `${error.response.status} ${error.response.statusText}`;
      
      // Check if this is a successful upload with Firestore warning
      if (error.response.status === 201 && error.response.data?.success) {
        console.warn('[WARN] Upload succeeded but Firestore tracking may have failed');
        return error.response.data;
      }
      
      throw new ApiError(
        `Failed to upload file: ${errorMessage}${
          error.response.data ? ` - ${JSON.stringify(error.response.data)}` : ''
        }`,
        error.response.status
      );
    } else if (error.request) {
      throw new ApiError(`Failed to upload file: No response from server at ${apiClient.defaults.baseURL}`);
    } else {
      throw new ApiError(`Failed to upload file: ${error.message}`);
    }
  }
}

module.exports = {
  uploadFileDirectly,
  uploadFileDirectlyWithBuildTracking,
  ApiError
};