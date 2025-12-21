import type {
  ApiKey,
  CreateApiKeyData,
  CreateApiKeyResult,
  ValidateApiKeyResult,
  ApiKeyListItem,
} from './apikey.types.js';

/**
 * Defines the contract for all API key operations within the application.
 * Any class implementing this interface can be used as the API key backend.
 */
export interface ApiKeyService {
  /**
   * Creates a new API key for a project
   * @param projectId The project identifier
   * @param data The key creation data including name and creator
   * @returns A promise that resolves to the created key result with raw key (shown only once)
   */
  createApiKey(
    projectId: string,
    data: CreateApiKeyData
  ): Promise<CreateApiKeyResult>;

  /**
   * Validates an API key and returns its metadata if valid
   * @param projectId The project identifier (from route or extracted from key)
   * @param rawKey The raw API key to validate
   * @returns A promise that resolves to the validation result
   */
  validateApiKey(
    projectId: string,
    rawKey: string
  ): Promise<ValidateApiKeyResult>;

  /**
   * Lists all API keys for a project (without hash data)
   * @param projectId The project identifier
   * @returns A promise that resolves to an array of API key metadata
   */
  listApiKeys(projectId: string): Promise<ApiKeyListItem[]>;

  /**
   * Revokes an API key
   * @param projectId The project identifier
   * @param keyId The API key identifier
   * @param userId The user ID performing the revocation
   * @returns A promise that resolves when revocation is complete
   */
  revokeApiKey(
    projectId: string,
    keyId: string,
    userId: string
  ): Promise<void>;

  /**
   * Deletes an API key permanently
   * @param projectId The project identifier
   * @param keyId The API key identifier
   * @returns A promise that resolves when deletion is complete
   */
  deleteApiKey(
    projectId: string,
    keyId: string
  ): Promise<void>;

  /**
   * Updates the lastUsedAt timestamp for an API key
   * This is typically called fire-and-forget to avoid latency
   * @param projectId The project identifier
   * @param keyId The API key identifier
   * @returns A promise that resolves when the update is complete
   */
  updateLastUsed(
    projectId: string,
    keyId: string
  ): Promise<void>;
}