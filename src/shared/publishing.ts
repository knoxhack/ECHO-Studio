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
  releaseDraftPath?: string
  releaseIndexPreview?: unknown
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
