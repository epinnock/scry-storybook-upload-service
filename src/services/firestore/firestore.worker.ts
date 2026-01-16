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
    console.log('[FIRESTORE] createBuild start', {
      firestoreProjectId: this.config.projectId,
      projectId,
      versionId: data.versionId,
      zipUrl: data.zipUrl,
      hasCoverage: Boolean(data.coverage),
    });
    const token = await this.getAccessToken();
    
    // Get current build number
    const counterPath = `projects/${projectId}/counters/builds`;
    let buildNumber = 1;
    console.log('[FIRESTORE] createBuild counter path', { counterPath });
    
    try {
      const counterDoc = await this.getDocument(counterPath, token);
      if (counterDoc && counterDoc.fields?.currentBuildNumber?.integerValue) {
        buildNumber = parseInt(counterDoc.fields.currentBuildNumber.integerValue) + 1;
      }
    } catch (error) {
      // Counter doesn't exist, will create it
    }

    // Update counter
    console.log('[FIRESTORE] createBuild update counter', {
      counterPath,
      buildNumber,
    });
    await this.setDocument(counterPath, {
      currentBuildNumber: { integerValue: buildNumber.toString() }
    }, token);

    // Create build document
    const buildId = this.generateId();
    const buildPath = `projects/${projectId}/builds/${buildId}`;
    const now = new Date();
    console.log('[FIRESTORE] createBuild build path', {
      buildPath,
      buildId,
    });
    
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

    console.log('[FIRESTORE] createBuild writing build doc', {
      buildPath,
      versionId: data.versionId,
      buildNumber,
    });
    await this.setDocument(buildPath, buildDoc, token);
    console.log('[FIRESTORE] createBuild build doc written', {
      buildPath,
      buildId,
      buildNumber,
    });

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
   * Finds a build by its version ID.
   *
   * Note: We intentionally avoid `orderBy(buildNumber)` here to prevent requiring
   * a composite index (Firestore will throw FAILED_PRECONDITION without one).
   *
   * If multiple builds exist for the same version (should be rare), we select
   * the build with the highest `buildNumber` client-side.
   *
   * Concurrency caveat: if you run multiple deployments simultaneously for the
   * same (projectId, versionId), this selection may attach coverage to the
   * newest build for that version. If you need strict run-level association,
   * prefer passing/using an explicit buildId when attaching coverage.
   */
  async getBuildByVersion(
    projectId: string,
    versionId: string
  ): Promise<Build | null> {
    console.log('[FIRESTORE] getBuildByVersion start', {
      firestoreProjectId: this.config.projectId,
      projectId,
      versionId,
    });

    console.log('[FIRESTORE] getBuildByVersion requesting access token', {
      projectId,
      versionId,
    });
    const token = await this.getAccessToken();
    console.log('[FIRESTORE] getBuildByVersion access token acquired', {
      projectId,
      versionId,
      hasToken: Boolean(token),
    });

    const structuredQuery = {
      from: [{ collectionId: 'builds' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'versionId' },
          op: 'EQUAL',
          value: { stringValue: versionId },
        },
      },
      // No orderBy here to avoid composite index requirement
      limit: 50,
    };

    console.log('[FIRESTORE] getBuildByVersion structuredQuery', {
      projectId,
      versionId,
      structuredQuery,
    });

    const parentPath = `projects/${projectId}`;
    console.log('[FIRESTORE] getBuildByVersion running query', {
      projectId,
      versionId,
      parentPath,
    });
    const docs = await this.queryDocuments(parentPath, structuredQuery, token);
    console.log('[FIRESTORE] getBuildByVersion results', {
      firestoreProjectId: this.config.projectId,
      projectId,
      versionId,
      count: docs.length,
      docIds: docs.slice(0, 5).map((doc) => doc.name.split('/').pop()),
      docVersionIds: docs.slice(0, 5).map((doc) => doc.fields?.versionId?.stringValue),
    });
    if (docs.length === 0) {
      const fallbackQuery = {
        from: [{ collectionId: 'builds' }],
        limit: 5,
      };
      console.log('[FIRESTORE] getBuildByVersion fallback query (no filter)', {
        projectId,
        versionId,
        fallbackQuery,
      });
      const fallbackDocs = await this.queryDocuments(parentPath, fallbackQuery, token);
      console.log('[FIRESTORE] getBuildByVersion fallback results', {
        projectId,
        versionId,
        count: fallbackDocs.length,
        docIds: fallbackDocs.map((doc) => doc.name.split('/').pop()),
        docVersionIds: fallbackDocs.map((doc) => doc.fields?.versionId?.stringValue),
      });
      return null;
    }

    // Choose the latest build by buildNumber
    let bestDoc = docs[0];
    for (const doc of docs) {
      const current = this.convertDocToBuild(doc.name.split('/').pop()!, doc.fields);
      const best = this.convertDocToBuild(bestDoc.name.split('/').pop()!, bestDoc.fields);
      console.log('[FIRESTORE] getBuildByVersion candidate', {
        currentId: current.id,
        currentBuildNumber: current.buildNumber,
        currentVersionId: current.versionId,
        bestId: best.id,
        bestBuildNumber: best.buildNumber,
      });
      if ((current.buildNumber ?? 0) > (best.buildNumber ?? 0)) {
        bestDoc = doc;
      }
    }

    const id = bestDoc.name.split('/').pop()!;
    return this.convertDocToBuild(id, bestDoc.fields);
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
    const parentName = `projects/${this.config.projectId}/databases/(default)/documents/${parent}`;
    console.log('[FIRESTORE] queryDocuments start', {
      firestoreProjectId: this.config.projectId,
      parent,
      parentName,
      structuredQuery,
    });
    // Use the parent path in the URL for subcollection queries
    const url = `${this.baseUrl}/${parent}:runQuery`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to query documents: ${response.statusText}`);
    }

    const results = await response.json() as any[];
    console.log('[FIRESTORE] queryDocuments results', {
      firestoreProjectId: this.config.projectId,
      parent,
      parentName,
      count: results.filter((r: any) => r.document).length,
    });
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
    console.log('[FIRESTORE] getAccessToken start', {
      hasCachedToken: Boolean(this.accessToken),
      tokenExpiry: this.tokenExpiry,
      now: Date.now(),
    });
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      console.log('[FIRESTORE] getAccessToken using cached token', {
        tokenExpiry: this.tokenExpiry,
        now: Date.now(),
      });
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
      const errorText = await response.text();
      throw new Error(
        `Failed to get access token: ${response.status} ${response.statusText} ${errorText}`
      );
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    console.log('[FIRESTORE] getAccessToken fetched new token', {
      expiresIn: data.expires_in,
    });
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
    const trimmedKey = privateKey.trim();
    const unquotedKey = trimmedKey
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');
    const cleanedKey = unquotedKey.replace(/\\n/g, '\n');
    
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
