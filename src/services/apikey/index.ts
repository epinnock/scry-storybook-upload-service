/**
 * API Key Authentication Service
 * 
 * This module provides Firebase-backed API key management for project authentication.
 * 
 * Features:
 * - Project-scoped API keys stored in Firestore
 * - Secure SHA-256 hashing (raw keys never stored)
 * - Show-once key generation
 * - Key validation with automatic lastUsedAt tracking
 * - Support for key expiration and revocation
 * 
 * Usage:
 * ```typescript
 * // Create a new key (Dashboard API)
 * const result = await apiKeyService.createApiKey('project-id', {
 *   name: 'CI/CD Key',
 *   createdBy: 'user-id'
 * });
 * console.log('Save this key:', result.rawKey); // Only shown once!
 * 
 * // Validate a key (Upload Service)
 * const validation = await apiKeyService.validateApiKey('project-id', rawKey);
 * if (validation.valid) {
 *   // Proceed with request
 * }
 * ```
 */

// Types
export type {
  ApiKey,
  ApiKeyStatus,
  CreateApiKeyData,
  CreateApiKeyResult,
  ValidateApiKeyResult,
  ApiKeyListItem,
} from './apikey.types.js';

// Service Interface
export type { ApiKeyService } from './apikey.service.js';

// Utilities
export {
  generateApiKey,
  hashApiKey,
  getKeyPrefix,
  generateKeyId,
  extractProjectIdFromKey,
  isValidApiKeyFormat,
  generateRandomString,
} from './apikey.utils.js';

// Implementations (conditionally import based on environment)
// Node.js: import { ApiKeyServiceNode } from './apikey.node.js';
// Worker:  import { ApiKeyServiceWorker } from './apikey.worker.js';