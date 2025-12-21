import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  getKeyPrefix,
  generateKeyId,
  extractProjectIdFromKey,
  isValidApiKeyFormat,
  generateRandomString,
} from './apikey.utils.js';

describe('API Key Utilities', () => {
  describe('generateRandomString', () => {
    it('should generate a non-empty random string', () => {
      const result = generateRandomString();
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate different strings on each call', () => {
      const result1 = generateRandomString();
      const result2 = generateRandomString();
      expect(result1).not.toBe(result2);
    });

    it('should respect the length parameter', () => {
      const shortResult = generateRandomString(8);
      const longResult = generateRandomString(64);
      // Base62 encoding produces variable length output, but longer input produces longer output
      expect(shortResult.length).toBeLessThan(longResult.length);
    });
  });

  describe('generateApiKey', () => {
    it('should generate a key with the correct prefix format', () => {
      const projectId = 'my-project';
      const key = generateApiKey(projectId);
      
      expect(key).toMatch(/^scry_proj_/);
      expect(key).toContain(projectId);
    });

    it('should include the project ID in the key', () => {
      const projectId = 'test-project-123';
      const key = generateApiKey(projectId);
      
      expect(key.startsWith(`scry_proj_${projectId}_`)).toBe(true);
    });

    it('should generate unique keys for the same project', () => {
      const projectId = 'my-project';
      const key1 = generateApiKey(projectId);
      const key2 = generateApiKey(projectId);
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different projects', () => {
      const key1 = generateApiKey('project-a');
      const key2 = generateApiKey('project-b');
      
      expect(key1).not.toBe(key2);
      expect(key1).toContain('project-a');
      expect(key2).toContain('project-b');
    });
  });

  describe('extractProjectIdFromKey', () => {
    it('should extract the project ID from a valid key', () => {
      const projectId = 'my-project';
      const key = generateApiKey(projectId);
      
      const extractedId = extractProjectIdFromKey(key);
      expect(extractedId).toBe(projectId);
    });

    it('should return null for keys without the correct prefix', () => {
      const invalidKey = 'invalid_key_format_here';
      expect(extractProjectIdFromKey(invalidKey)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractProjectIdFromKey('')).toBeNull();
    });

    it('should return null for keys with prefix but no project ID', () => {
      const malformedKey = 'scry_proj_';
      expect(extractProjectIdFromKey(malformedKey)).toBeNull();
    });

    it('should handle project IDs with hyphens', () => {
      const projectId = 'my-awesome-project-v2';
      const key = `scry_proj_${projectId}_randomstring123`;
      
      const extractedId = extractProjectIdFromKey(key);
      expect(extractedId).toBe(projectId);
    });
  });

  describe('getKeyPrefix', () => {
    it('should return the first 12 characters of the key', () => {
      const key = 'scry_proj_my-project_randomstring12345';
      const prefix = getKeyPrefix(key);
      
      expect(prefix).toBe('scry_proj_my');
      expect(prefix.length).toBe(12);
    });

    it('should return the whole key if shorter than 12 characters', () => {
      const shortKey = 'short';
      const prefix = getKeyPrefix(shortKey);
      
      expect(prefix).toBe('short');
    });
  });

  describe('hashApiKey', () => {
    it('should produce a consistent hash for the same input', async () => {
      const key = 'scry_proj_my-project_randomstring123';
      
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const key1 = 'scry_proj_project1_random123';
      const key2 = 'scry_proj_project2_random456';
      
      const hash1 = await hashApiKey(key1);
      const hash2 = await hashApiKey(key2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce a hex-encoded SHA-256 hash (64 characters)', async () => {
      const key = 'scry_proj_my-project_randomstring123';
      const hash = await hashApiKey(key);
      
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('isValidApiKeyFormat', () => {
    it('should return true for valid key format', () => {
      const validKey = generateApiKey('my-project');
      expect(isValidApiKeyFormat(validKey)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidApiKeyFormat('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidApiKeyFormat(null as any)).toBe(false);
      expect(isValidApiKeyFormat(undefined as any)).toBe(false);
    });

    it('should return false for keys without correct prefix', () => {
      expect(isValidApiKeyFormat('wrong_prefix_key_here')).toBe(false);
      expect(isValidApiKeyFormat('scry_wrong_prefix')).toBe(false);
    });

    it('should return false for keys with missing project ID', () => {
      expect(isValidApiKeyFormat('scry_proj__randomstring')).toBe(false);
    });

    it('should return false for keys with short random part', () => {
      expect(isValidApiKeyFormat('scry_proj_myproject_short')).toBe(false);
    });

    it('should return true for properly formatted keys', () => {
      expect(isValidApiKeyFormat('scry_proj_my-project_abcdefghijklmnopqrst')).toBe(true);
      expect(isValidApiKeyFormat('scry_proj_project123_randomstring12345678')).toBe(true);
    });
  });

  describe('generateKeyId', () => {
    it('should generate a 20-character string', () => {
      const keyId = generateKeyId();
      expect(keyId.length).toBe(20);
    });

    it('should only contain alphanumeric characters', () => {
      const keyId = generateKeyId();
      expect(keyId).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateKeyId();
      const id2 = generateKeyId();
      const id3 = generateKeyId();
      
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });
});