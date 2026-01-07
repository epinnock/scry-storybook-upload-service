/**
 * Represents the status of a build in the system
 */
export type BuildStatus = 'active' | 'archived';

/**
 * Summary metrics extracted from a coverage report.
 *
 * This is the normalized, stable shape we store on Build documents.
 */
export interface CoverageSummary {
  componentCoverage: number;
  propCoverage: number;
  variantCoverage: number;
  passRate: number;
  totalComponents: number;
  componentsWithStories: number;
  failingStories: number;
}

/**
 * A single quality gate check.
 */
export interface QualityGateCheck {
  name: string;
  threshold: number;
  actual: number;
  passed: boolean;
}

/**
 * Quality gate evaluation result.
 */
export interface QualityGateResult {
  passed: boolean;
  checks: QualityGateCheck[];
}

/**
 * Normalized coverage data stored on a build.
 */
export interface BuildCoverage {
  /**
   * Public URL to the full raw coverage JSON stored in R2.
   */
  reportUrl: string;

  /**
   * Normalized summary extracted from the raw report.
   */
  summary: CoverageSummary;

  /**
   * Quality gate result.
   */
  qualityGate: QualityGateResult;

  /**
   * ISO timestamp when the report was generated.
   */
  generatedAt: string;
}

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

  /**
   * Normalized coverage data for the build (if uploaded).
   */
  coverage?: BuildCoverage;
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

  /**
   * Optional normalized coverage data to store alongside build creation.
   */
  coverage?: BuildCoverage;
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

  /**
   * Normalized coverage data for the build (if uploaded).
   */
  coverage?: BuildCoverage;
}
