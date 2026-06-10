import type { AddonPackageValidationResult } from './addonPackageContract'
import type { PublishStatus, ValidationReport } from './types'

export interface ReleaseReviewMessage {
  from: 'reviewer' | 'creator'
  text: string
  at: number
}

export interface ReleaseReviewState {
  target: string
  description: string
  changelog: string
  screenshots: string[]
  permissionsConfirmed: boolean
  status: PublishStatus
  thread: ReleaseReviewMessage[]
  lastHash?: string
  submittedAt?: number
}

export const RELEASE_REVIEW_TARGETS = [
  'Release Index Ingestion',
  'Verified Release Review',
  'Private Draft Release',
  'Server Pack Handoff'
] as const

/** @deprecated Use ReleaseReviewMessage. Kept for legacy saved review state. */
export type SubmissionReview = ReleaseReviewMessage

/** @deprecated Use ReleaseReviewState. Kept for legacy saved review state. */
export type SubmissionState = ReleaseReviewState

/** @deprecated Use RELEASE_REVIEW_TARGETS. Kept for legacy saved review state. */
export const RELEASE_SUBMISSION_TARGETS = RELEASE_REVIEW_TARGETS

export interface ReleaseEntry {
  version: string
  channel: 'alpha' | 'beta' | 'stable'
  hash: string
  zipPath: string
  notes: string
  at: number
}

export interface ReleasesState {
  releases: ReleaseEntry[]
}

export interface PackageResult {
  zipPath: string
  hash: string
  bytes: number
  report: ValidationReport
  sdkValidation: AddonPackageValidationResult
  assetPaths: string[]
  checksumsPath?: string
  packageManifestPath?: string
  releaseManifestPath?: string
  releaseIndexHandoffPath?: string
  releaseIndexSubmissionPath?: string
  releaseDraftPath?: string
  releaseIndexPreview?: unknown
  releaseIndexHandoff?: ReleaseIndexHandoff
}

export interface ReleaseIndexHandoffAsset {
  name: string
  path?: string
  sha256: string
  bytes: number
  role: 'artifact' | 'sidecar'
}

export interface ReleaseIndexAttestationSubject {
  name: string
  sha256: string
  bytes: number
  sourceRepo: string
  releaseTag: string
  commitSha?: string
}

export interface ReleaseIndexHandoff {
  schemaVersion: 'echo.release.index.handoff.v1'
  generatedAt: string
  targetRepository: 'knoxhack/ECHO-Release-Index'
  targetCollection: 'addons'
  entryFileName: string
  entry: unknown
  sourceRepo: string
  releaseTag: string
  commitSha?: string
  assets: ReleaseIndexHandoffAsset[]
  checksums: {
    file: 'checksums.sha256'
    sha256: string
  }
  attestation: {
    mode: 'required-for-official-or-verified'
    provider: 'github-artifact-attestations'
    requiredWorkflow: string
    requireDigestMatch: true
    subjects: ReleaseIndexAttestationSubject[]
  }
  ingestion: {
    status: 'pending-review'
    requireSchemaValidation: true
    requireValidationReady: boolean
    /** @deprecated Use requireValidationReady. Kept for older handoff validators. */
    requirePackOSReady?: boolean
    notes: string[]
  }
}

export type GitHubAuthProvider = 'github-app' | 'gh-cli' | 'none'

export interface GitHubPublishingStatus {
  githubAppConfigured: boolean
  githubAppInstallUrl?: string
  githubAppBrokerConfigured: boolean
  githubAppBrokerUrl?: string
  githubAppSessionReady: boolean
  ghCliAvailable: boolean
  ghCliAuthenticated: boolean
  activeProvider: GitHubAuthProvider
  message: string
}

export interface GitHubAppLoginStart {
  authProvider: 'github-app'
  authorizeUrl?: string
  installUrl?: string
  sessionId?: string
  message: string
}

export interface GitHubRepoConnection {
  owner: string
  repo: string
  authenticated: boolean
  exists: boolean
  authProvider: GitHubAuthProvider
  url?: string
  message: string
}

export interface GitHubReleaseDraftResult {
  owner: string
  repo: string
  tag: string
  draft: boolean
  url?: string
  assets: string[]
  command?: string[]
  authProvider: GitHubAuthProvider
}
