import type { Runtime } from './types'
import type { ProjectModulePlan } from './moduleCatalog'

export type DevWorkspaceMode = 'visual' | 'gradle' | 'full'

export interface DevWorkspaceOptions {
  mode: DevWorkspaceMode
  runtimes: Runtime[]
  force?: boolean
}

export interface DevWorkspaceFileStatus {
  path: string
  exists: boolean
  generatedByStudio: boolean
  expected: boolean
}

export interface DevArtifact {
  path: string
  name: string
  kind: 'jar' | 'echo-addon' | 'manifest' | 'checksum' | 'other'
  bytes: number
  modifiedAt: number
}

export interface DevModuleLockModule {
  id: string
  aliases: string[]
  name: string
  version?: string
  role: string
  kind: string
  status: string
  channel: string
  publicApi: string
  requires: string[]
  optional: string[]
  runtimes: string[]
  standaloneReady: boolean
  launcherVisible: boolean
  source?: string
  moduleDir?: string
  descriptorPath?: string
}

export interface DevModuleLock {
  schemaVersion: 'echo.studio.modules.lock.v1'
  generatedBy: string
  generatedAt: string
  project: {
    id: string
    version: string
  }
  catalog: {
    source: 'builtin' | 'local-index'
    indexPath?: string
    moduleRoot?: string
    generatedAt?: string
    warnings: string[]
  }
  declared: string[]
  normalizedDeclared: string[]
  moduleCount: number
  modules: DevModuleLockModule[]
  missingRequired: string[]
  unknown: string[]
}

export interface DevWorkspaceState {
  ready: boolean
  mode: DevWorkspaceMode
  projectPath: string
  gradleReady: boolean
  hasGradleWrapper: boolean
  sourceReady: boolean
  runtimeTargets: Runtime[]
  files: DevWorkspaceFileStatus[]
  modulePlan: ProjectModulePlan
  artifacts: DevArtifact[]
  lastSetupAt?: string
}

export interface DevSetupResult {
  state: DevWorkspaceState
  written: string[]
  skipped: string[]
}

export type DevTaskId =
  | 'gradle:tasks'
  | 'gradle:build'
  | 'gradle:test'
  | 'gradle:clean'
  | 'gradle:runClient'
  | 'gradle:runServer'
  | 'gradle:runData'
  | 'preview:native'
  | 'preview:standalone'
  | 'package:local'

export interface DevTask {
  id: DevTaskId
  label: string
  description: string
  command: string
  kind: 'inspect' | 'build' | 'test' | 'run' | 'package'
  detached?: boolean
}

export interface DevTaskRun {
  taskId: DevTaskId
  status: 'completed' | 'failed' | 'started'
  command: string
  cwd: string
  pid?: number
  logPath?: string
  exitCode?: number
  stdout: string
  stderr: string
  startedAt: string
  finishedAt?: string
  artifacts: DevArtifact[]
}

export const DEV_TASKS: DevTask[] = [
  {
    id: 'gradle:tasks',
    label: 'List Gradle Tasks',
    description: 'Inspect available Gradle tasks for this project.',
    command: 'tasks',
    kind: 'inspect'
  },
  {
    id: 'gradle:build',
    label: 'Build All Targets',
    description: 'Run the main Gradle build and produce local artifacts.',
    command: 'build',
    kind: 'build'
  },
  {
    id: 'gradle:test',
    label: 'Run Tests',
    description: 'Run Gradle tests for the local project.',
    command: 'test',
    kind: 'test'
  },
  {
    id: 'gradle:clean',
    label: 'Clean Build',
    description: 'Remove Gradle build outputs.',
    command: 'clean',
    kind: 'build'
  },
  {
    id: 'gradle:runClient',
    label: 'Start NeoForge Client',
    description: 'Launch the NeoForge development client if the project defines one.',
    command: 'runClient',
    kind: 'run',
    detached: true
  },
  {
    id: 'gradle:runServer',
    label: 'Start NeoForge Server',
    description: 'Launch the NeoForge development server if the project defines one.',
    command: 'runServer',
    kind: 'run',
    detached: true
  },
  {
    id: 'gradle:runData',
    label: 'Generate Data',
    description: 'Run the Gradle data generation task when available.',
    command: 'runData',
    kind: 'build'
  },
  {
    id: 'preview:native',
    label: 'Start Native Preview',
    description: 'Start the ECHO Native preview lane for this project.',
    command: 'echoNativePreview',
    kind: 'run',
    detached: true
  },
  {
    id: 'preview:standalone',
    label: 'Start Standalone Runtime',
    description: 'Start the standalone runtime preview lane for this project.',
    command: 'echoStandalonePreview',
    kind: 'run',
    detached: true
  },
  {
    id: 'package:local',
    label: 'Package Local Release',
    description: 'Build local ECHO release assets and sidecar manifests.',
    command: 'studioPackage',
    kind: 'package'
  }
]
