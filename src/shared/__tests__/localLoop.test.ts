import { describe, expect, it } from 'vitest'
import { buildLocalLoopStatus } from '../localLoop'
import type { DevWorkspaceState } from '../devWorkspace'
import type { EchoModuleRecord, ProjectModulePlan } from '../moduleCatalog'
import type { ValidationReport } from '../types'

const moduleRecord: EchoModuleRecord = {
  id: 'echocore',
  aliases: ['echo:core'],
  name: 'Core',
  role: 'foundation',
  kind: 'foundation',
  status: 'stable',
  channel: 'stable',
  standaloneReady: true,
  launcherVisible: true,
  ashfallRequired: false,
  publicApi: 'stable',
  trustLevel: 'official',
  requires: [],
  optional: [],
  provides: ['core'],
  runtimes: ['neoforge', 'echo_native', 'standalone'],
  creatorUse: 'Base services.'
}

function report(overrides: Partial<ValidationReport> = {}): ValidationReport {
  return {
    compatibilityScore: 100,
    publishingReady: true,
    counts: {
      BLOCKER: 0,
      ERROR: 0,
      WARNING: 0,
      INFO: 0,
      SUGGESTION: 0
    },
    issues: [],
    healthScore: {
      compatibility: 100,
      nativeReadiness: 100,
      assets: 100,
      permissions: 'Safe',
      publishing: 'Ready'
    },
    ...overrides
  }
}

function modulePlan(overrides: Partial<ProjectModulePlan> = {}): ProjectModulePlan {
  return {
    declared: ['echo:core'],
    normalizedDeclared: ['echocore'],
    targetModules: [moduleRecord],
    requiredModules: [moduleRecord],
    optionalModules: [],
    enabled: [moduleRecord],
    unknown: [],
    missingRequired: [],
    optionalAvailable: [],
    closure: [moduleRecord],
    ...overrides
  }
}

function workspace(overrides: Partial<DevWorkspaceState> = {}): DevWorkspaceState {
  return {
    ready: true,
    mode: 'gradle',
    projectPath: 'C:/project',
    gradleReady: true,
    hasGradleWrapper: true,
    sourceReady: true,
    runtimeTargets: ['neoforge'],
    files: [],
    toolchain: {
      schemaVersion: 'echo.studio.toolchain.status.v1',
      requiredJavaVersion: 21,
      javaAvailable: true,
      javaVersion: '21',
      javaMajorVersion: 21,
      javaMeetsRequirement: true,
      gradleWrapper: true,
      gradleAvailable: true,
      gradleVersion: '9.1.0',
      gradleCommand: './gradlew',
      issues: []
    },
    modulePlan: modulePlan(),
    moduleCatalog: {
      schemaVersion: 'echo.studio.modules.catalog.status.v1',
      source: 'local-index',
      localAvailable: true,
      warnings: []
    },
    moduleWorkspace: {
      schemaVersion: 'echo.studio.modules.workspace.status.v1',
      path: '.echo-studio/module-workspace.json',
      exists: true,
      upToDate: true,
      projectMatches: true,
      moduleCount: 1,
      localModuleCount: 1,
      expectedModuleIds: ['echocore'],
      mappedModuleIds: ['echocore'],
      missingFromMap: [],
      extraInMap: []
    },
    moduleLock: {
      schemaVersion: 'echo.studio.modules.lock.status.v1',
      studioLockPath: '.echo-studio/modules.lock.json',
      runtimeLockPath: 'src/generated/resources/META-INF/echo.modules.lock.json',
      studioExists: true,
      runtimeExists: true,
      runtimeExpected: true,
      upToDate: true,
      runtimeUpToDate: true,
      projectMatches: true,
      expectedModuleIds: ['echocore'],
      lockedModuleIds: ['echocore'],
      runtimeModuleIds: ['echocore'],
      missingFromLock: [],
      extraInLock: [],
      missingFromRuntimeLock: [],
      extraInRuntimeLock: []
    },
    runtimeLaunchers: {
      schemaVersion: 'echo.studio.runtime.launchers.status.v1',
      gradlePropertiesPath: 'gradle.properties',
      gradlePropertiesExists: true,
      nativeExpected: false,
      nativeConfigured: false,
      nativeExecutable: '',
      standaloneExpected: false,
      standaloneConfigured: false,
      standaloneExecutable: '',
      ready: true
    },
    artifacts: [],
    lastSetupAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  }
}

describe('buildLocalLoopStatus', () => {
  it('uses stable local-loop labels in order', () => {
    const status = buildLocalLoopStatus({
      hasProject: true,
      validationReport: report(),
      devWorkspace: workspace(),
      releaseAssetsReady: true
    })

    expect(status.steps.map((step) => step.label)).toEqual([
      'Modules',
      'Workspace',
      'Preview',
      'Validation',
      'Release'
    ])
    expect(status.nextStep).toBeUndefined()
  })

  it('marks a clean project ready when validation and release artifacts are ready', () => {
    const status = buildLocalLoopStatus({
      hasProject: true,
      validationReport: report(),
      devWorkspace: workspace(),
      releaseAssetsReady: true
    })

    expect(status.steps.map((step) => step.state)).toEqual(['ready', 'ready', 'ready', 'ready', 'ready'])
  })

  it('surfaces a stale module lock as the next module action', () => {
    const status = buildLocalLoopStatus({
      hasProject: true,
      validationReport: report(),
      devWorkspace: workspace({
        moduleLock: {
          ...workspace().moduleLock,
          upToDate: false,
          missingFromLock: ['echomissioncore']
        }
      })
    })

    expect(status.nextStep?.id).toBe('modules')
    expect(status.nextStep?.state).toBe('attention')
    expect(status.nextStep?.detail).toContain('Module lock is stale.')
  })

  it('routes missing runtime launchers to Settings', () => {
    const status = buildLocalLoopStatus({
      hasProject: true,
      validationReport: report(),
      devWorkspace: workspace({
        runtimeLaunchers: {
          ...workspace().runtimeLaunchers,
          nativeExpected: true,
          nativeConfigured: false,
          ready: false
        }
      })
    })
    const preview = status.steps.find((step) => step.id === 'preview')

    expect(preview?.state).toBe('attention')
    expect(preview?.route).toBe('/settings')
    expect(preview?.actionLabel).toBe('Configure Preview')
  })

  it('blocks release when validation has blockers', () => {
    const status = buildLocalLoopStatus({
      hasProject: true,
      validationReport: report({
        publishingReady: false,
        compatibilityScore: 61,
        counts: {
          BLOCKER: 1,
          ERROR: 0,
          WARNING: 0,
          INFO: 0,
          SUGGESTION: 0
        },
        healthScore: {
          compatibility: 61,
          nativeReadiness: 100,
          assets: 50,
          permissions: 'Blocked',
          publishing: 'Not Ready'
        }
      }),
      devWorkspace: workspace()
    })

    expect(status.steps.find((step) => step.id === 'validation')?.state).toBe('attention')
    expect(status.steps.find((step) => step.id === 'release')?.state).toBe('attention')
    expect(status.steps.find((step) => step.id === 'release')?.actionLabel).toBe('Fix Validation')
  })

  it('detects ready release assets from workspace artifacts', () => {
    const status = buildLocalLoopStatus({
      hasProject: true,
      validationReport: report(),
      devWorkspace: workspace({
        artifacts: [
          { path: 'exports/example.echo-addon', name: 'example.echo-addon', kind: 'echo-addon', bytes: 10, modifiedAt: 1 },
          { path: 'exports/echo-release.json', name: 'echo-release.json', kind: 'manifest', bytes: 10, modifiedAt: 1 },
          { path: 'exports/checksums.sha256', name: 'checksums.sha256', kind: 'checksum', bytes: 10, modifiedAt: 1 }
        ]
      })
    })

    expect(status.steps.find((step) => step.id === 'release')?.state).toBe('ready')
    expect(status.nextStep).toBeUndefined()
  })
})
