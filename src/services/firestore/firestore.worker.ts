import type { FirestoreService } from './firestore.service.js';
import type { Build, BuildCoverage, CreateBuildData, UpdateBuildData, BuildStatus } from './firestore.types.js';

interface FirestoreConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  serviceAccountId: string;
}

/**
 * Cloudflare Worker implementation of FirestoreService using Firestore REST API
 * This implementation uses service account authentication via JWT tokens
 */
export class FirestoreServiceWorker implements FirestoreService {
  private config: FirestoreConfig;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: FirestoreConfig) {
    this.config = config;
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
  }

  /**
   * Creates a new build record with auto-incrementing build number
   * Note: REST API doesn't support true transactions, so we use a simplified approach
   */
  async createBuild(
    projectId: string,
    data: CreateBuildData
  ): Promise<Build> {
    const token = await this.getAccessToken();
    
    // Get current build number
    const counterPath = `projects/${projectId}/counters/builds`;
    let buildNumber = 1;
    
    try {
      const counterDoc = await this.getDocument(counterPath, token);
      if (counterDoc && counterDoc.fields?.currentBuildNumber?.integerValue) {
        buildNumber = parseInt(counterDoc.fields.currentBuildNumber.integerValue) + 1;
      }
    } catch (error) {
      // Counter doesn't exist, will create it
    }

    // Update counter
    await this.setDocument(counterPath, {
      currentBuildNumber: { integerValue: buildNumber.toString() }
    }, token);

    // Create build document
    const buildId = this.generateId();
    const buildPath = `projects/${projectId}/builds/${buildId}`;
    const now = new Date();
    
    const buildDoc = {
      projectId: { stringValue: projectId },
      versionId: { stringValue: data.versionId },
      buildNumber: { integerValue: buildNumber.toString() },
      zipUrl: { stringValue: data.zipUrl },
      status: { stringValue: 'active' },
      createdAt: { timestampValue: now.toISOString() },
      createdBy: { stringValue: this.config.serviceAccountId },
      ...(data.coverage ? { coverage: this.toFirestoreValue(data.coverage) } : {}),
    };

    await this.setDocument(buildPath, buildDoc, token);

    return {
      id: buildId,
      projectId,
      versionId: data.versionId,
      buildNumber,
      zipUrl: data.zipUrl,
      status: 'active',
      createdAt: now,
      createdBy: this.config.serviceAccountId,
    };
  }

  /**
   * Retrieves a build by its ID
   */
  async getBuild(
    projectId: string,
    buildId: string
  ): Promise<Build | null> {
    const token = await this.getAccessToken();
    const buildPath = `projects/${projectId}/builds/${buildId}`;
    
    try {
      const doc = await this.getDocument(buildPath, token);
      if (!doc) return null;
      return this.convertDocToBuild(buildId, doc.fields);
    } catch (error) {
      return null;
    }
  }

  /**
   * Gets all builds for a project with optional filtering
   */
  async getProjectBuilds(
    projectId: string,
    statusFilter?: BuildStatus,
    limitCount: number = 50
  ): Promise<Build[]> {
    const token = await this.getAccessToken();
    const collectionPath = `projects/${projectId}/builds`;
    
    // Build query
    const structuredQuery: any = {
      from: [{ collectionId: 'builds' }],
      orderBy: [{ field: { fieldPath: 'buildNumber' }, direction: 'DESCENDING' }],
      limit: limitCount
    };

    if (statusFilter) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: statusFilter }
        }
      };
    }

    const docs = await this.queryDocuments(`projects/${projectId}`, structuredQuery, token);
    return docs.map(doc => {
      const id = doc.name.split('/').pop()!;
      return this.convertDocToBuild(id, doc.fields);
    });
  }

  /**
   * Finds a build by its version ID
   */
  async getBuildByVersion(
    projectId: string,
    versionId: string
  ): Promise<Build | null> {
    const token = await this.getAccessToken();
    
    const structuredQuery = {
      from: [{ collectionId: 'builds' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'versionId' },
          op: 'EQUAL',
          value: { stringValue: versionId }
        }
      },
      limit: 1
    };

    const docs = await this.queryDocuments(`projects/${projectId}`, structuredQuery, token);
    if (docs.length === 0) return null;
    
    const id = docs[0].name.split('/').pop()!;
    return this.convertDocToBuild(id, docs[0].fields);
  }

  /**
   * Gets the latest active build for a project
   */
  async getLatestBuild(
    projectId: string
  ): Promise<Build | null> {
    const token = await this.getAccessToken();
    
    const structuredQuery = {
      from: [{ collectionId: 'builds' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'active' }
        }
      },
      orderBy: [{ field: { fieldPath: 'buildNumber' }, direction: 'DESCENDING' }],
      limit: 1
    };

    const docs = await this.queryDocuments(`projects/${projectId}`, structuredQuery, token);
    if (docs.length === 0) return null;
    
    const id = docs[0].name.split('/').pop()!;
    return this.convertDocToBuild(id, docs[0].fields);
  }

  /**
   * Updates a build record
   */
  async updateBuild(
    projectId: string,
    buildId: string,
    updates: UpdateBuildData
  ): Promise<void> {
    const token = await this.getAccessToken();
    const buildPath = `projects/${projectId}/builds/${buildId}`;
    
    const fields: any = {};
    if (updates.status) fields.status = { stringValue: updates.status };
    if (updates.zipUrl) fields.zipUrl = { stringValue: updates.zipUrl };
    if (updates.archivedAt) fields.archivedAt = { timestampValue: updates.archivedAt.toISOString() };
    if (updates.archivedBy) fields.archivedBy = { stringValue: updates.archivedBy };
    if (updates.coverage) fields.coverage = this.toFirestoreValue(updates.coverage);

    await this.patchDocument(buildPath, fields, token);
  }

  /**
   * Archives a build
   */
  async archiveBuild(
    projectId: string,
    buildId: string,
    userId: string
  ): Promise<void> {
    const token = await this.getAccessToken();
    const buildPath = `projects/${projectId}/builds/${buildId}`;
    
    const fields = {
      status: { stringValue: 'archived' },
      archivedAt: { timestampValue: new Date().toISOString() },
      archivedBy: { stringValue: userId }
    };

    await this.patchDocument(buildPath, fields, token);
  }

  /**
   * Updates coverage data for a build
   */
  async updateBuildCoverage(
    projectId: string,
    buildId: string,
    coverage: BuildCoverage
  ): Promise<void> {
    const token = await this.getAccessToken();
    const buildPath = `projects/${projectId}/builds/${buildId}`;

    await this.patchDocument(buildPath, { coverage: this.toFirestoreValue(coverage) }, token);
  }

  /**
   * Deletes a build record
   */
  async deleteBuild(
    projectId: string,
    buildId: string
  ): Promise<void> {
    const token = await this.getAccessToken();
    const buildPath = `projects/${projectId}/builds/${buildId}`;
    
    const url = `${this.baseUrl}/${buildPath}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete build: ${response.statusText}`);
    }
  }

  /**
   * Helper methods for Firestore REST API operations
   */

  /**
   * Convert a JavaScript value into a Firestore REST "Value" object.
   *
   * This is used for nested objects (coverage payload) to keep the Worker
   * implementation feature-parity with the Node Admin SDK version.
   */
  private toFirestoreValue(value: any): any {
    if (value === null) return { nullValue: null };
    if (value === undefined) return { nullValue: null };

    if (value instanceof Date) return { timestampValue: value.toISOString() };

    const t = typeof value;
    if (t === 'string') return { stringValue: value };
    if (t === 'boolean') return { booleanValue: value };
    if (t === 'number') {
      if (Number.isInteger(value)) return { integerValue: value.toString() };
      return { doubleValue: value };
    }

    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.toFirestoreValue(v)),
        },
      };
    }

    if (t === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined) continue;
        fields[k] = this.toFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }

    // Fallback: coerce unknowns to string
    return { stringValue: String(value) };
  }

  /**
   * Convert a Firestore REST "Value" object back into JavaScript.
   *
   * This is only used for returning typed data from read operations.
   */
  private fromFirestoreValue(value: any): any {
    if (!value || typeof value !== 'object') return value;

    if ('nullValue' in value) return null;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return parseInt(value.integerValue, 10);
    if ('doubleValue' in value) return value.doubleValue;
    if ('stringValue' in value) return value.stringValue;
    if ('timestampValue' in value) return value.timestampValue;

    if ('mapValue' in value) {
      const fields = value.mapValue?.fields || {};
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        obj[k] = this.fromFirestoreValue(v);
      }
      return obj;
    }

    if ('arrayValue' in value) {
      const values = value.arrayValue?.values || [];
      return values.map((v: any) => this.fromFirestoreValue(v));
    }

    return value;
  }

  private async getDocument(path: string, token: string): Promise<any> {
    const url = `${this.baseUrl}/${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get document: ${response.statusText}`);
    }

    return response.json();
  }

  private async setDocument(path: string, fields: any, token: string): Promise<void> {
    const url = `${this.baseUrl}/${path}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      throw new Error(`Failed to set document: ${response.statusText}`);
    }
  }

  private async patchDocument(path: string, fields: any, token: string): Promise<void> {
    const url = `${this.baseUrl}/${path}`;
    const updateMask = Object.keys(fields).join(',');
    
    const response = await fetch(`${url}?updateMask.fieldPaths=${updateMask}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      throw new Error(`Failed to patch document: ${response.statusText}`);
    }
  }

  private async queryDocuments(parent: string, structuredQuery: any, token: string): Promise<any[]> {
    const url = `${this.baseUrl}:runQuery`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: `${this.baseUrl}/${parent}`,
        structuredQuery
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to query documents: ${response.statusText}`);
    }

    const results = await response.json() as any[];
    return results.filter((r: any) => r.document).map((r: any) => r.document);
  }

  private convertDocToBuild(id: string, fields: any): Build {
    return {
      id,
      projectId: fields.projectId?.stringValue || '',
      versionId: fields.versionId?.stringValue || '',
      buildNumber: parseInt(fields.buildNumber?.integerValue || '0'),
      zipUrl: fields.zipUrl?.stringValue || '',
      status: (fields.status?.stringValue || 'active') as BuildStatus,
      createdAt: new Date(fields.createdAt?.timestampValue || new Date()),
      createdBy: fields.createdBy?.stringValue || '',
      archivedAt: fields.archivedAt?.timestampValue ? new Date(fields.archivedAt.timestampValue) : undefined,
      archivedBy: fields.archivedBy?.stringValue,
      coverage: fields.coverage ? (this.fromFirestoreValue(fields.coverage) as any) : undefined,
    };
  }

  /**
   * Generate access token using service account credentials
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Create JWT
    const jwt = await this.createJWT();

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 1 minute before expiry

    return this.accessToken!;
  }

  /**
   * Create JWT token for service account authentication
   */
  private async createJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: this.config.clientEmail,
      sub: this.config.clientEmail,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/datastore',
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // Sign with private key
    const signature = await this.signJWT(unsignedToken, this.config.privateKey);
    return `${unsignedToken}.${signature}`;
  }

  /**
   * Sign JWT using RSA-SHA256
   */
  private async signJWT(data: string, privateKey: string): Promise<string> {
    // Import private key
    // Handle both literal \n and actual newlines in the private key
    const cleanedKey = privateKey.replace(/\\n/g, '\n');
    
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    
    // Extract the content between the header and footer
    const pemContents = cleanedKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, ''); // Remove all whitespace including newlines
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Sign the data
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoder.encode(data)
    );

    return this.base64UrlEncode(signature);
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(data: string | ArrayBuffer): string {
    let base64: string;
    
    if (typeof data === 'string') {
      base64 = btoa(data);
    } else {
      const bytes = new Uint8Array(data);
      const binary = String.fromCharCode(...bytes);
      base64 = btoa(binary);
    }
    
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Generate a random document ID
   */
  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 20; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}