import type { AddonPackageValidationResult } from './addonPackageContract'
import type { PackOSReport, PublishStatus } from './types'

export interface SubmissionReview {
  from: 'reviewer' | 'creator'
  text: string
  at: number
}

export interface SubmissionState {
  target: string
  description: string
  changelog: string
  screenshots: string[]
  permissionsConfirmed: boolean
  status: PublishStatus
  thread: SubmissionReview[]
  lastHash?: string
  submittedAt?: number
}

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
  report: PackOSReport
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
    requirePackOSReady: boolean
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
