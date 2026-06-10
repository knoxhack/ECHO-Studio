import type { Runtime } from './types'
import type { ProjectModulePlan } from './moduleCatalog'

export type DevWorkspaceMode = 'visual' | 'gradle' | 'full'

export interface DevWorkspaceOptions {
  mode: DevWorkspaceMode
  runtimes: Runtime[]
  force?: boolean
  runtimeTools?: {
    echoNativeExecutable?: string
    standaloneExecutable?: string
  }
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
  trustLevel?: string
  blocked?: boolean
  blockReason?: string
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

export interface DevModuleWorkspaceModule {
  id: string
  name: string
  version?: string
  role: string
  publicApi: string
  trustLevel?: string
  blocked?: boolean
  blockReason?: string
  runtimes: string[]
  requires: string[]
  optional: string[]
  localSource: boolean
  gradleBuild?: boolean
  gradleBuildPath?: string
  gradleProjectPath?: string
  gradleProjectDependencies?: string[]
  missingGradleProjectDependencies?: string[]
  gradleDependencyReady?: boolean
  dependencyNotation?: string
  source?: string
  moduleDir?: string
  descriptorPath?: string
}

export interface DevModuleWorkspaceMap {
  schemaVersion: 'echo.studio.modules.workspace.v1'
  generatedBy: string
  generatedAt: string
  project: {
    id: string
    version: string
  }
  catalog: DevModuleCatalogStatus
  declared: string[]
  normalizedDeclared: string[]
  moduleCount: number
  localModuleCount: number
  gradleBuildCount?: number
  gradleDependencyReadyCount?: number
  modules: DevModuleWorkspaceModule[]
  missingRequired: string[]
  unknown: string[]
}

export interface DevModuleLockStatus {
  schemaVersion: 'echo.studio.modules.lock.status.v1'
  studioLockPath: string
  runtimeLockPath: string
  studioExists: boolean
  runtimeExists: boolean
  runtimeExpected: boolean
  upToDate: boolean
  runtimeUpToDate: boolean
  projectMatches: boolean
  expectedModuleIds: string[]
  lockedModuleIds: string[]
  runtimeModuleIds: string[]
  missingFromLock: string[]
  extraInLock: string[]
  missingFromRuntimeLock: string[]
  extraInRuntimeLock: string[]
  lockedProjectId?: string
  lockedProjectVersion?: string
  generatedAt?: string
}

export interface DevModuleCatalogStatus {
  schemaVersion: 'echo.studio.modules.catalog.status.v1'
  source: 'builtin' | 'local-index'
  localAvailable: boolean
  indexPath?: string
  moduleRoot?: string
  generatedAt?: string
  warnings: string[]
}

export interface DevModuleWorkspaceStatus {
  schemaVersion: 'echo.studio.modules.workspace.status.v1'
  path: string
  exists: boolean
  upToDate: boolean
  projectMatches: boolean
  moduleCount: number
  localModuleCount: number
  gradleBuildCount?: number
  gradleDependencyReadyCount?: number
  modules?: DevModuleWorkspaceModule[]
  expectedModuleIds: string[]
  mappedModuleIds: string[]
  missingFromMap: string[]
  extraInMap: string[]
  gradleDependencyIssues?: Array<{
    moduleId: string
    moduleName: string
    projectPath?: string
    missingProjectDependencies: string[]
  }>
  generatedAt?: string
}

export interface DevRuntimeLauncherStatus {
  schemaVersion: 'echo.studio.runtime.launchers.status.v1'
  gradlePropertiesPath: string
  gradlePropertiesExists: boolean
  nativeExpected: boolean
  nativeConfigured: boolean
  nativeExecutable: string
  standaloneExpected: boolean
  standaloneConfigured: boolean
  standaloneExecutable: string
  ready: boolean
}

export interface DevToolchainStatus {
  schemaVersion: 'echo.studio.toolchain.status.v1'
  requiredJavaVersion: number
  javaHome?: string
  javaAvailable: boolean
  javaVersion?: string
  javaMajorVersion?: number
  javaMeetsRequirement: boolean
  gradleWrapper: boolean
  gradleAvailable: boolean
  gradleVersion?: string
  gradleCommand: string
  issues: string[]
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
  toolchain: DevToolchainStatus
  modulePlan: ProjectModulePlan
  moduleCatalog: DevModuleCatalogStatus
  moduleWorkspace: DevModuleWorkspaceStatus
  moduleLock: DevModuleLockStatus
  runtimeLaunchers: DevRuntimeLauncherStatus
  artifacts: DevArtifact[]
  lastSetupAt?: string
}

export interface DevSetupResult {
  state: DevWorkspaceState
  written: string[]
  skipped: string[]
}

export type DevTaskId =
  | 'studio:validate'
  | 'studio:releaseGate'
  | 'gradle:tasks'
  | 'gradle:build'
  | 'gradle:test'
  | 'gradle:clean'
  | 'gradle:moduleWorkspace'
  | 'gradle:runClient'
  | 'gradle:runServer'
  | 'gradle:runData'
  | 'modules:validate'
  | 'modules:releaseSelected'
  | 'modules:releaseAll'
  | 'modules:verifyRelease'
  | 'modules:docsAudit'
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
  status: 'completed' | 'failed' | 'started' | 'stopped'
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

export interface DevTaskStopResult {
  status: 'stopped' | 'not_running'
  taskId?: DevTaskId
  command?: string
  cwd?: string
  pid?: number
  logPath: string
  finishedAt?: string
  message: string
}

export function recommendedDevWorkspaceMode(runtimes: Runtime[]): DevWorkspaceMode {
  return runtimes.includes('echo_native') || runtimes.includes('standalone') ? 'full' : 'gradle'
}

export const DEV_TASKS: DevTask[] = [
  {
    id: 'studio:validate',
    label: 'Run Studio Validation',
    description: 'Run the full ECHO Studio validation report with module, toolchain, content, asset, and release readiness checks.',
    command: 'studioValidation',
    kind: 'test'
  },
  {
    id: 'studio:releaseGate',
    label: 'Run Local Release Gate',
    description: 'Check the current manifest, module locks, workspace map, and validation report before packaging release assets.',
    command: 'studioReleaseGate',
    kind: 'test'
  },
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
    id: 'gradle:moduleWorkspace',
    label: 'Inspect Module Workspace',
    description: 'Print the resolved ECHO module closure and linked local source folders.',
    command: 'echoModuleWorkspace',
    kind: 'inspect'
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
    id: 'modules:validate',
    label: 'Validate ECHO Modules',
    description: 'Run the local ECHO-Modules graph validator for the selected module catalog.',
    command: 'node scripts/validate-module-graph.mjs',
    kind: 'test'
  },
  {
    id: 'modules:releaseSelected',
    label: 'Generate Selected Module Visibility',
    description: 'Generate source-packaged development visibility artifacts for the resolved local module closure.',
    command: 'node scripts/generate-module-release.mjs --out dist/echo-module-release --package-from-source',
    kind: 'package'
  },
  {
    id: 'modules:releaseAll',
    label: 'Generate All Module Visibility',
    description: 'Generate source-packaged development visibility artifacts for every discoverable local ECHO module.',
    command: 'node scripts/generate-module-release.mjs --out dist/echo-module-release --package-from-source',
    kind: 'package'
  },
  {
    id: 'modules:verifyRelease',
    label: 'Verify Module Visibility Artifacts',
    description: 'Verify dist/echo-module-release visibility manifests, packages, jars, embedded metadata, and checksums.',
    command: 'node scripts/verify-module-release.mjs --release-dir dist/echo-module-release',
    kind: 'test'
  },
  {
    id: 'modules:docsAudit',
    label: 'Audit Module Docs',
    description: 'Run the local ECHO-Modules documentation audit.',
    command: 'node scripts/docs-audit.mjs',
    kind: 'test'
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
    label: 'Prepare Release Assets',
    description: 'Build local ECHO release artifacts, checksums, sidecars, and Release Index handoff files.',
    command: 'studioPackage',
    kind: 'package'
  }
]
