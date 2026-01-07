import admin from 'firebase-admin';
import type { Firestore, FieldValue } from 'firebase-admin/firestore';
import type { FirestoreService } from './firestore.service.js';
import type { Build, BuildCoverage, CreateBuildData, UpdateBuildData, BuildStatus } from './firestore.types.js';

/**
 * Node.js implementation of FirestoreService using Firebase Admin SDK
 */
export class FirestoreServiceNode implements FirestoreService {
  private db: Firestore;
  private serviceAccountId: string;

  constructor(serviceAccountId: string = 'upload-service') {
    this.db = admin.firestore();
    this.serviceAccountId = serviceAccountId;
  }

  /**
   * Creates a new build record with auto-incrementing build number
   * Uses Firestore transaction to ensure atomicity
   */
  async createBuild(
    projectId: string,
    data: CreateBuildData
  ): Promise<Build> {
    return this.db.runTransaction(async (transaction) => {
      // Reference to counter document
      const counterRef = this.db.doc(`projects/${projectId}/counters/builds`);
      const counterSnap = await transaction.get(counterRef);

      // Initialize counter if it doesn't exist
      let buildNumber = 1;
      if (!counterSnap.exists) {
        transaction.set(counterRef, { currentBuildNumber: 1 });
      } else {
        buildNumber = counterSnap.data()!.currentBuildNumber + 1;
        transaction.update(counterRef, {
          currentBuildNumber: admin.firestore.FieldValue.increment(1) as any
        });
      }

      // Create build document
      const buildRef = this.db.collection(`projects/${projectId}/builds`).doc();
      const buildData = {
        projectId,
        versionId: data.versionId,
        buildNumber,
        zipUrl: data.zipUrl,
        status: 'active' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: this.serviceAccountId,
        ...(data.coverage ? { coverage: data.coverage } : {}),
      };

      transaction.set(buildRef, buildData);

      // Return the created build (with current timestamp estimate)
      return {
        id: buildRef.id,
        projectId,
        versionId: data.versionId,
        buildNumber,
        zipUrl: data.zipUrl,
        status: 'active' as const,
        createdAt: new Date(),
        createdBy: this.serviceAccountId,
        coverage: data.coverage,
      };
    });
  }

  /**
   * Retrieves a build by its ID
   */
  async getBuild(
    projectId: string,
    buildId: string
  ): Promise<Build | null> {
    const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
    const buildSnap = await buildRef.get();

    if (!buildSnap.exists) {
      return null;
    }

    return this.convertDocToBuild(buildSnap.id, buildSnap.data()!);
  }

  /**
   * Gets all builds for a project with optional filtering
   */
  async getProjectBuilds(
    projectId: string,
    statusFilter?: BuildStatus,
    limitCount: number = 50
  ): Promise<Build[]> {
    let query = this.db.collection(`projects/${projectId}/builds`)
      .orderBy('buildNumber', 'desc')
      .limit(limitCount);

    if (statusFilter) {
      query = this.db.collection(`projects/${projectId}/builds`)
        .where('status', '==', statusFilter)
        .orderBy('createdAt', 'desc')
        .limit(limitCount);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => this.convertDocToBuild(doc.id, doc.data()));
  }

  /**
   * Finds a build by its version ID
   */
  async getBuildByVersion(
    projectId: string,
    versionId: string
  ): Promise<Build | null> {
    const snapshot = await this.db.collection(`projects/${projectId}/builds`)
      .where('versionId', '==', versionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return this.convertDocToBuild(doc.id, doc.data());
  }

  /**
   * Gets the latest active build for a project
   */
  async getLatestBuild(
    projectId: string
  ): Promise<Build | null> {
    const snapshot = await this.db.collection(`projects/${projectId}/builds`)
      .where('status', '==', 'active')
      .orderBy('buildNumber', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return this.convertDocToBuild(doc.id, doc.data());
  }

  /**
   * Updates a build record
   */
  async updateBuild(
    projectId: string,
    buildId: string,
    updates: UpdateBuildData
  ): Promise<void> {
    const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
    await buildRef.update(updates as any);
  }

  /**
   * Updates coverage data for a build
   */
  async updateBuildCoverage(
    projectId: string,
    buildId: string,
    coverage: BuildCoverage
  ): Promise<void> {
    const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
    await buildRef.update({ coverage } as any);
  }

  /**
   * Archives a build
   */
  async archiveBuild(
    projectId: string,
    buildId: string,
    userId: string
  ): Promise<void> {
    const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
    await buildRef.update({
      status: 'archived',
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedBy: userId,
    });
  }

  /**
   * Deletes a build record
   */
  async deleteBuild(
    projectId: string,
    buildId: string
  ): Promise<void> {
    const buildRef = this.db.doc(`projects/${projectId}/builds/${buildId}`);
    await buildRef.delete();
  }

  /**
   * Helper method to convert Firestore document to Build object
   */
  private convertDocToBuild(id: string, data: any): Build {
    return {
      id,
      projectId: data.projectId,
      versionId: data.versionId,
      buildNumber: data.buildNumber,
      zipUrl: data.zipUrl,
      status: data.status,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      createdBy: data.createdBy,
      archivedAt: data.archivedAt?.toDate?.(),
      archivedBy: data.archivedBy,
      coverage: data.coverage,
    };
  }
}