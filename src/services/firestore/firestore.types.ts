/**
 * Represents the status of a build in the system
 */
export type BuildStatus = 'active' | 'archived';

/**
 * Represents a build record in Firestore
 */
export interface Build {
  /**
   * Unique identifier for the build
   */
  id: string;
  
  /**
   * Project identifier
   */
  projectId: string;
  
  /**
   * Version identifier (can be semver, commit SHA, etc.)
   */
  versionId: string;
  
  /**
   * Auto-incrementing build number per project
   */
  buildNumber: number;
  
  /**
   * URL to the build artifact ZIP file
   */
  zipUrl: string;
  
  /**
   * Current status of the build
   */
  status: BuildStatus;
  
  /**
   * Timestamp when the build was created
   */
  createdAt: Date;
  
  /**
   * User ID who created/triggered the build
   */
  createdBy: string;
  
  /**
   * Timestamp when the build was archived (if applicable)
   */
  archivedAt?: Date;
  
  /**
   * User ID who archived the build (if applicable)
   */
  archivedBy?: string;
}

/**
 * Data required to create a new build record
 */
export interface CreateBuildData {
  /**
   * Version identifier for the build
   */
  versionId: string;
  
  /**
   * URL to the uploaded ZIP file
   */
  zipUrl: string;
}

/**
 * Data that can be updated in a build record
 */
export interface UpdateBuildData {
  /**
   * New status for the build
   */
  status?: BuildStatus;
  
  /**
   * New ZIP URL (in case of re-upload)
   */
  zipUrl?: string;
  
  /**
   * Archive timestamp
   */
  archivedAt?: Date;
  
  /**
   * User who archived the build
   */
  archivedBy?: string;
}