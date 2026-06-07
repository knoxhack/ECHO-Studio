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
}
