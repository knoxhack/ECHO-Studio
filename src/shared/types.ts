// Shared domain types for ECHO Studio.
// Used by both the Electron main process (filesystem) and the renderer (UI).

export type AddonType =
  | 'gameplay_addon'
  | 'mission_pack'
  | 'recipe_pack'
  | 'ui_addon'
  | 'holomap_layer'
  | 'index_pack'
  | 'world_pack'
  | 'theme_pack'
  | 'asset_pack'
  | 'server_module'
  | 'community_experience'

export type TargetExperience =
  | 'ashfall'
  | 'echo_prime'
  | 'arcana_division'
  | 'custom'
  | 'generic'

export type Runtime = 'neoforge' | 'echo_native' | 'standalone'

export type DeveloperRole =
  | 'addon_developer'
  | 'verified_addon_developer'
  | 'pack_maker'
  | 'server_owner'
  | 'tester'

export type PublishStatus =
  | 'draft'
  | 'ready'
  | 'submitted'
  | 'in_validation'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'published'

export type TrustLevel = 'community' | 'verified' | 'featured' | 'blocked' | 'local'

export interface AddonManifest {
  schemaVersion: number
  id: string
  name: string
  version: string
  description: string
  developerType: DeveloperRole
  publisher: {
    id: string
    name: string
    type: string
    website?: string
    support?: string
  }
  projectClass: string
  namespace: string
  target: {
    experiences: TargetExperience[]
    modules: string[]
  }
  runtime: {
    supports: Runtime[]
    nativeReadiness: 'none' | 'partial' | 'full'
    minimumEchoSdk: string
  }
  permissions: string[]
  dependencies: {
    required: string[]
    optional: string[]
  }
  trust: {
    level: TrustLevel
    signed: boolean
    verified: boolean
  }
  support: {
    tier: string
    issues?: string
  }
  tags?: string[]
}

// Lightweight project summary used in lists (Project Library, Dashboard).
export interface AddonProject {
  path: string
  folderName: string
  manifest: AddonManifest
  lastEdited: number
  publishStatus: PublishStatus
}

export type IssueLevel = 'BLOCKER' | 'ERROR' | 'WARNING' | 'INFO' | 'SUGGESTION'

export interface ValidationIssue {
  level: IssueLevel
  category: string
  message: string
  fix?: string
  file?: string
  aiFixable?: boolean
}

export interface ValidationReport {
  compatibilityScore: number
  publishingReady: boolean
  counts: Record<IssueLevel, number>
  issues: ValidationIssue[]
  healthScore: {
    compatibility: number
    nativeReadiness: number
    assets: number
    permissions: 'Safe' | 'Risky' | 'Blocked'
    publishing: 'Ready' | 'Not Ready'
  }
}

/** @deprecated Use ValidationReport. Kept for older Studio state and integrations. */
export type PackOSReport = ValidationReport

export interface CreateAddonOptions {
  workspaceDir: string
  type: AddonType
  target: TargetExperience
  namespace: string
  addonId: string
  name: string
  description: string
  runtimes: Runtime[]
  options: CreateAddonScaffoldOptions
}

export interface CreateAddonScaffoldOptions {
  includeExample: boolean
  includeHoloMap: boolean
  includeIndex: boolean
  includeRewards: boolean
  includeLocalization: boolean
  includePreviewProfile: boolean
  /** @deprecated use includePreviewProfile. */
  includeSandbox?: boolean
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
}

export interface IpcResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}
